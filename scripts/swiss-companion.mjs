#!/usr/bin/env node

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { chromium } from "playwright-core";

const PORT = Number(process.env.FILZY_COMPANION_PORT || 47831);
const HOST = "127.0.0.1";
const ROOT = join(homedir(), ".filzy");
const PROFILE = join(ROOT, "swisstransfer-profile");
const CONFIG_FILE = join(ROOT, "companion.json");
const TEMP_ROOT = join(tmpdir(), "filzy-swiss-companion");
const MAX_BYTES = 50 * 1024 ** 3;
const EXPIRY_DAYS = new Set([1, 7, 15, 30]);
const ALLOWED_ORIGINS = [
  "https://filzy.site",
  "https://www.filzy.site",
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const jobs = new Map();
let contextPromise = null;

await mkdir(ROOT, { recursive: true });
await mkdir(PROFILE, { recursive: true });
await mkdir(TEMP_ROOT, { recursive: true });

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  setCors(response, origin);
  if (request.method === "OPTIONS") return end(response, 204);
  if (origin && !originAllowed(origin)) return json(response, 403, { error: "Origin not allowed." });

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/") return html(response, setupPage(await readConfig()));
    if (request.method === "GET" && url.pathname === "/health") {
      const config = await readConfig();
      return json(response, 200, { ok: true, service: "filzy-swiss-companion", configured: Boolean(config.email), port: PORT });
    }
    if (request.method === "PUT" && url.pathname === "/settings") {
      const input = await readJson(request);
      const email = String(input.email || "").trim().slice(0, 254);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(response, 400, { error: "Enter a valid email address." });
      await writeFile(CONFIG_FILE, JSON.stringify({ email }, null, 2), { mode: 0o600 });
      return json(response, 200, { ok: true, configured: true });
    }
    if (request.method === "POST" && url.pathname === "/jobs") return createJob(request, response);

    const fileMatch = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]+)\/files\/(\d+)$/);
    if (request.method === "PUT" && fileMatch) return receiveFile(request, response, fileMatch[1], Number(fileMatch[2]));

    const jobMatch = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]+)(?:\/(start|cancel|open))?$/);
    if (jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(response, 404, { error: "Job not found." });
      const action = jobMatch[2] || "status";
      if (request.method === "GET" && action === "status") return json(response, 200, publicJob(job));
      if (request.method === "POST" && action === "start") return startJob(request, response, job);
      if (request.method === "POST" && action === "cancel") return cancelJob(response, job);
      if (request.method === "POST" && action === "open") {
        await job.page?.bringToFront().catch(() => {});
        return json(response, 200, { ok: true });
      }
    }
    return json(response, 404, { error: "Not found." });
  } catch (cause) {
    return json(response, 500, { error: cause?.message || "Companion error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Filzy SwissTransfer companion is ready at http://${HOST}:${PORT}`);
  console.log("Files are staged only in your temporary folder and removed after the transfer finishes or is cancelled.");
});

async function createJob(request, response) {
  const input = await readJson(request);
  const fileCount = Number(input.fileCount);
  const totalBytes = Number(input.totalBytes);
  if (!Number.isInteger(fileCount) || fileCount < 1 || fileCount > 500) return json(response, 400, { error: "Choose between 1 and 500 files." });
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > MAX_BYTES) return json(response, 400, { error: "A transfer can contain up to 50 GB." });
  const id = randomId();
  const directory = join(TEMP_ROOT, id);
  await mkdir(directory, { recursive: true });
  const job = {
    id,
    directory,
    state: "receiving",
    fileCount,
    totalBytes,
    receivedBytes: 0,
    files: new Array(fileCount),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: "",
    transferUrl: "",
    transferProgress: 0,
    verification: false,
    cancelled: false,
    page: null,
  };
  jobs.set(id, job);
  return json(response, 201, publicJob(job));
}

async function receiveFile(request, response, jobId, index) {
  const job = jobs.get(jobId);
  if (!job || job.cancelled) return json(response, 404, { error: "Job not found." });
  if (job.state !== "receiving") return json(response, 409, { error: "This job is no longer accepting files." });
  if (!Number.isInteger(index) || index < 0 || index >= job.fileCount || job.files[index]) return json(response, 400, { error: "Invalid file index." });
  const expectedSize = Number(request.headers["x-filzy-size"] || request.headers["content-length"] || 0);
  const originalName = decodeURIComponent(String(request.headers["x-filzy-name"] || `file-${index + 1}`));
  const fileDirectory = join(job.directory, String(index + 1).padStart(4, "0"));
  await mkdir(fileDirectory, { recursive: true });
  const path = join(fileDirectory, sanitizeName(originalName));
  let received = 0;
  request.on("data", (chunk) => {
    received += chunk.length;
    job.receivedBytes += chunk.length;
    job.updatedAt = Date.now();
  });
  try {
    await pipeline(request, createWriteStream(path, { flags: "wx", mode: 0o600 }));
  } catch (cause) {
    job.receivedBytes = Math.max(0, job.receivedBytes - received);
    await rm(fileDirectory, { recursive: true, force: true }).catch(() => {});
    throw cause;
  }
  if (expectedSize && received !== expectedSize) {
    await rm(fileDirectory, { recursive: true, force: true });
    job.receivedBytes = Math.max(0, job.receivedBytes - received);
    return json(response, 400, { error: "The local file stream ended early." });
  }
  if (job.receivedBytes > MAX_BYTES || job.receivedBytes > job.totalBytes) {
    await rm(fileDirectory, { recursive: true, force: true });
    job.receivedBytes = Math.max(0, job.receivedBytes - received);
    return json(response, 413, { error: "The received files exceed this transfer's declared size." });
  }
  job.files[index] = { path, name: originalName, size: received };
  job.updatedAt = Date.now();
  return json(response, 200, { ok: true, receivedBytes: job.receivedBytes, totalBytes: job.totalBytes });
}

async function startJob(request, response, job) {
  if (job.state !== "receiving") return json(response, 409, { error: "This job already started." });
  if (job.files.some((file) => !file)) return json(response, 409, { error: "Not every file reached the companion yet." });
  const input = await readJson(request);
  const config = await readConfig();
  if (!config.email) return json(response, 409, { error: "Open the companion setup page and save the email SwissTransfer should verify.", code: "NEEDS_SETUP" });
  const expiresInDays = Number(input.expiresInDays || 30);
  if (!EXPIRY_DAYS.has(expiresInDays)) return json(response, 400, { error: "SwissTransfer currently supports 1, 7, 15, or 30 days." });
  job.options = {
    email: config.email,
    title: cleanText(input.title, 120),
    message: cleanText(input.message, 500),
    expiresInDays,
  };
  job.state = "opening";
  job.updatedAt = Date.now();
  void automate(job).catch(async (cause) => {
    if (job.cancelled) return;
    job.state = "error";
    job.error = cause?.message || "SwissTransfer automation stopped.";
    job.updatedAt = Date.now();
    await cleanupFiles(job);
  });
  return json(response, 202, publicJob(job));
}

async function automate(job) {
  const context = await browserContext();
  const page = await context.newPage();
  job.page = page;
  await page.goto("https://www.swisstransfer.com/", { waitUntil: "domcontentloaded", timeout: 60000 });

  const decline = page.getByRole("button", { name: "Decline", exact: true });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  const agree = page.getByRole("button", { name: "I agree", exact: true });
  if (await agree.isVisible().catch(() => false)) await agree.click();

  const input = page.locator('input[type="file"]:not([webkitdirectory])').first();
  await input.waitFor({ state: "attached", timeout: 30000 });
  job.state = "loading-files";
  await input.setInputFiles(job.files.map((file) => file.path));

  const linkMode = page.getByRole("button", { name: "Link", exact: true });
  await linkMode.waitFor({ state: "visible", timeout: 30000 });
  await linkMode.click();
  await fillIfPresent(page.getByRole("textbox", { name: "Title (optional)", exact: true }), job.options.title);
  await fillIfPresent(page.getByRole("textbox", { name: "Your email address *", exact: true }), job.options.email);
  await fillIfPresent(page.getByRole("textbox", { name: "Your message (optional)", exact: true }), job.options.message);

  if (job.options.expiresInDays !== 30) await chooseExpiry(page, job.options.expiresInDays);
  job.state = "uploading";
  job.transferProgress = 0;
  const transfer = page.getByRole("button", { name: "Transfer", exact: true });
  await transfer.click();
  await waitForResult(job, page);
}

async function chooseExpiry(page, days) {
  const settings = page.getByRole("button", { name: /Expires in .*No password/ }).first();
  await settings.click();
  const period = page.locator('button[role="combobox"]:visible').filter({ hasText: /days?/ }).first();
  await period.click();
  await page.getByRole("option", { name: days === 1 ? "1 day" : `${days} days`, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function waitForResult(job, page) {
  const started = Date.now();
  while (!job.cancelled && Date.now() - started < 4 * 60 * 60 * 1000) {
    const transferUrl = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll("input,textarea,a")];
      for (const element of candidates) {
        const value = element.value || element.href || element.textContent || "";
        const match = String(value).match(/https:\/\/(?:www\.)?swisstransfer\.com\/d\/[A-Za-z0-9_-]+/i);
        if (match) return match[0];
      }
      return "";
    });
    if (transferUrl) {
      job.transferUrl = transferUrl;
      job.state = "complete";
      job.verification = false;
      job.transferProgress = 1;
      job.updatedAt = Date.now();
      await cleanupFiles(job);
      await page.close().catch(() => {});
      job.page = null;
      return;
    }

    const pageProgress = await page.evaluate(() => {
      const values = [...document.querySelectorAll('[role="progressbar"], progress, [aria-valuenow]')]
        .map((element) => Number(element.getAttribute("aria-valuenow") || element.value || 0))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
      if (values.length) return Math.max(...values) / 100;
      const match = document.body?.innerText?.match(/(?:^|\s)(\d{1,3})\s*%(?:\s|$)/m);
      return match ? Math.min(1, Number(match[1]) / 100) : 0;
    }).catch(() => 0);
    if (pageProgress > job.transferProgress) {
      job.transferProgress = pageProgress;
      job.updatedAt = Date.now();
    }

    const verification = await page.getByText(/verification code|confirm your email|check your inbox/i).first().isVisible().catch(() => false);
    if (verification) {
      job.state = "verification";
      job.verification = true;
      job.updatedAt = Date.now();
      await page.bringToFront().catch(() => {});
    }
    const alert = page.getByRole("alert").first();
    if (await alert.isVisible().catch(() => false)) {
      const text = cleanText(await alert.innerText().catch(() => ""), 300);
      if (text) job.error = text;
    }
    await page.waitForTimeout(750);
  }
  if (job.cancelled) return;
  throw new Error("SwissTransfer did not finish before the companion timed out.");
}

async function cancelJob(response, job) {
  job.cancelled = true;
  job.state = "cancelled";
  job.updatedAt = Date.now();
  await job.page?.close().catch(() => {});
  job.page = null;
  await cleanupFiles(job);
  return json(response, 200, publicJob(job));
}

async function browserContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const executablePath = await findChrome();
      return chromium.launchPersistentContext(PROFILE, {
        executablePath,
        headless: false,
        acceptDownloads: true,
        locale: "en-GB",
        viewport: { width: 1280, height: 860 },
      });
    })().catch((cause) => {
      contextPromise = null;
      throw cause;
    });
  }
  return contextPromise;
}

async function findChrome() {
  const candidates = [
    process.env.FILZY_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error("Google Chrome was not found. Set FILZY_CHROME_PATH to its executable.");
}

async function cleanupFiles(job) {
  await rm(job.directory, { recursive: true, force: true }).catch(() => {});
}

function publicJob(job) {
  return {
    id: job.id,
    state: job.state,
    fileCount: job.fileCount,
    totalBytes: job.totalBytes,
    receivedBytes: job.receivedBytes,
    progress: job.totalBytes ? Math.min(1, job.receivedBytes / job.totalBytes) : 1,
    transferProgress: job.transferProgress,
    verification: job.verification,
    transferUrl: job.transferUrl,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function originAllowed(origin) {
  return ALLOWED_ORIGINS.some((allowed) => typeof allowed === "string" ? allowed === origin : allowed.test(origin));
}

function setCors(response, origin) {
  if (originAllowed(origin)) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "origin");
  response.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, x-filzy-name, x-filzy-size");
  response.setHeader("access-control-allow-private-network", "true");
  response.setHeader("access-control-max-age", "86400");
}

function sanitizeName(value) {
  return basename(String(value || "file")).replace(/[\u0000-\u001f\u007f/\\:]/g, "-").slice(0, 220) || "file";
}

function cleanText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function randomId() {
  return `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
}

async function fillIfPresent(locator, value) {
  if (value && await locator.isVisible().catch(() => false)) await locator.fill(value);
}

async function readConfig() {
  try { return JSON.parse(await readFile(CONFIG_FILE, "utf8")); } catch { return {}; }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request metadata is too large.");
    chunks.push(chunk);
  }
  return size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function end(response, status) {
  response.statusCode = status;
  response.end();
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function html(response, value) {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(value);
}

function setupPage(config) {
  const email = String(config.email || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Filzy companion</title><style>body{font:14px system-ui;background:#f4f4f4;color:#050505;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(360px,calc(100vw - 32px));background:#fff;border:1px solid #ddd;border-radius:16px;padding:18px;box-sizing:border-box}h1{font-size:18px;margin:0 0 6px}p{color:#6f747b;line-height:1.45;margin:0 0 16px}input,button{width:100%;box-sizing:border-box;height:42px;border-radius:10px;border:1px solid #ddd;padding:0 12px;font:inherit}button{background:#050505;color:#fff;margin-top:8px;cursor:pointer}</style></head><body><form class="card" id="setup"><h1>Filzy companion</h1><p>SwissTransfer verifies this address once in its own browser window. Filzy never sends it anywhere else.</p><input name="email" type="email" required placeholder="Your email" value="${email}"><button>Save email</button></form><script>setup.onsubmit=async(e)=>{e.preventDefault();const email=new FormData(setup).get('email');const r=await fetch('/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({email})});const d=await r.json();alert(d.ok?'Saved. You can return to Filzy.':d.error)}</script></body></html>`;
}

const sweep = setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.updatedAt >= cutoff || ["uploading", "verification", "opening", "loading-files"].includes(job.state)) continue;
    void cleanupFiles(job);
    jobs.delete(id);
  }
}, 15 * 60 * 1000);
sweep.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    for (const job of jobs.values()) await cleanupFiles(job);
    const context = await contextPromise?.catch(() => null);
    await context?.close().catch(() => {});
    process.exit(0);
  });
}
