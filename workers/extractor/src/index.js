import puppeteer from "@cloudflare/puppeteer";

const TARGET_HOSTS = [
  "youtube.com",
  "youtu.be",
  "youtubei.googleapis.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
];
const REQUEST_HEADERS = new Set(["accept", "accept-language", "content-type", "range", "user-agent", "x-origin"]);
const RESPONSE_HEADERS = ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"];
const QUALITY_PRIORITY = ["highres", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];

function allowedTarget(value) {
  try {
    const target = new URL(value);
    return target.protocol === "https:"
      && !target.username
      && !target.password
      && (!target.port || target.port === "443")
      && TARGET_HOSTS.some((domain) => target.hostname === domain || target.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "Accept, Accept-Language, Content-Type, Range, X-Goog-Visitor-Id, X-Origin, X-Youtube-Client-Name, X-Youtube-Client-Version",
    "access-control-expose-headers": "Content-Range, Accept-Ranges, Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  });
  if (origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(data, status, origin) {
  const headers = corsHeaders(origin);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanMediaUrl(value) {
  const url = new URL(value);
  for (const key of ["range", "rn", "rbuf"]) url.searchParams.delete(key);
  return url.toString();
}

function playerFormats(playerResponse, capturedUrls) {
  const streamingData = playerResponse?.streamingData || {};
  const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
  return formats
    .map((format) => {
      const captured = capturedUrls.find((entry) => Number(entry.itag) === Number(format.itag));
      return captured ? { ...format, url: captured.url } : null;
    })
    .filter(Boolean);
}

async function resolveWithBrowser(env, videoId) {
  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();
  const captured = new Map();

  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    page.on("request", (event) => {
      try {
        const url = new URL(event.url());
        if (!url.hostname.endsWith("googlevideo.com") || !url.pathname.includes("videoplayback")) return;
        const itag = Number(url.searchParams.get("itag") || 0);
        if (itag && !captured.has(itag)) captured.set(itag, cleanMediaUrl(url.toString()));
      } catch {
        // Ignore unrelated or malformed browser requests.
      }
    });

    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const playerResponseText = await page.evaluate(() => {
      const response = globalThis.ytInitialPlayerResponse
        || globalThis.ytplayer?.config?.args?.raw_player_response
        || null;
      return typeof response === "string" ? response : JSON.stringify(response);
    });
    const playerResponse = JSON.parse(playerResponseText || "null");
    if (playerResponse?.playabilityStatus?.status !== "OK") {
      throw new Error(playerResponse?.playabilityStatus?.reason || "YouTube did not return a playable source");
    }

    const levelsText = await page.evaluate(() => {
      const player = document.getElementById("movie_player");
      if (!player) return "[]";
      player.mute?.();
      player.playVideo?.();
      return JSON.stringify(player.getAvailableQualityLevels?.() || []);
    });
    const availableLevels = JSON.parse(levelsText || "[]");
    const levels = QUALITY_PRIORITY.filter((quality) => availableLevels.includes(quality)).slice(0, 5);
    for (const quality of levels.length ? levels : ["highres"]) {
      await page.evaluate((level) => {
        const player = document.getElementById("movie_player");
        player?.setPlaybackQualityRange?.(level, level);
        player?.setPlaybackQuality?.(level);
        player?.playVideo?.();
      }, quality);
      await new Promise((resolve) => setTimeout(resolve, 850));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const capturedUrls = [...captured].map(([itag, url]) => ({ itag, url }));
    const formats = playerFormats(playerResponse, capturedUrls);
    const details = playerResponse.videoDetails || {};
    if (!formats.length) throw new Error("YouTube did not expose a downloadable media stream");

    return {
      title: details.title || "YouTube video",
      author: details.author || "YouTube",
      durationSeconds: Number(details.lengthSeconds || 0),
      thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      formats,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (REQUEST_HEADERS.has(lower) || lower.startsWith("x-youtube-") || lower.startsWith("x-goog-")) headers.set(name, value);
  }
  return headers;
}

function stableUpstreamTarget(target, method) {
  const url = new URL(target);
  if (method === "POST" && url.hostname === "www.youtube.com" && url.pathname.startsWith("/youtubei/")) {
    // Cloudflare's shared youtube.com egress is frequently served Google's
    // automated-query interstitial. The same InnerTube API is available at
    // Google's dedicated API host and is considerably more reliable here.
    url.hostname = "youtubei.googleapis.com";
  }
  return url.toString();
}

async function fetchAllowed(target, init) {
  let current = target;
  let method = init.method;
  let body = init.body;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, { ...init, method, body, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Too many upstream redirects");
    const next = new URL(location, current).toString();
    if (!allowedTarget(next)) throw new Error("Blocked upstream redirect");
    await response.body?.cancel();
    if (method === "POST" && [301, 302, 303].includes(response.status)) {
      method = "GET";
      body = undefined;
    } else if (body && [307, 308].includes(response.status)) {
      throw new Error("Cannot replay a streamed request body");
    }
    current = next;
  }
  throw new Error("Upstream redirect failed");
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === null) return json({ error: "Origin not allowed" }, 403, "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/resolve" || requestUrl.searchParams.has("videoId")) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
      const videoId = requestUrl.searchParams.get("videoId") || "";
      if (!/^[\w-]{11}$/.test(videoId)) return json({ error: "Invalid YouTube video id" }, 400, origin);
      try {
        return json(await resolveWithBrowser(env, videoId), 200, origin);
      } catch (error) {
        return json({ error: String(error?.message || "Could not resolve this YouTube video") }, 502, origin);
      }
    }

    if (!["GET", "HEAD", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, 405, origin);

    const target = requestUrl.searchParams.get("url") || "";
    if (!allowedTarget(target)) return json({ error: "Unsupported extraction target" }, 400, origin);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 2 * 1024 * 1024) return json({ error: "Request body is too large" }, 413, origin);

    try {
      const upstreamTarget = stableUpstreamTarget(target, request.method);
      const requestHeaders = upstreamHeaders(request);
      if (new URL(upstreamTarget).hostname.endsWith("youtube.com") && request.method === "POST") {
        requestHeaders.set("origin", "https://www.youtube.com");
      }
      const upstream = await fetchAllowed(upstreamTarget, {
        method: request.method,
        headers: requestHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      });
      const responseHeaders = corsHeaders(origin);
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    } catch {
      return json({ error: "The upstream media request failed" }, 502, origin);
    }
  },
};
