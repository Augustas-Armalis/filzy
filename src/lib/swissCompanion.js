const COMPANION_URL = "http://127.0.0.1:47831";

export class CompanionError extends Error {
  constructor(message, { code = "", status = 0 } = {}) {
    super(message);
    this.name = "CompanionError";
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${COMPANION_URL}${path}`, {
      ...options,
      headers: options.body && !(options.body instanceof Blob)
        ? { "content-type": "application/json", ...options.headers }
        : options.headers,
    });
  } catch {
    throw new CompanionError("Start the Filzy companion to use SwissTransfer.", { code: "OFFLINE" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new CompanionError(payload.error || "The Filzy companion could not continue.", { code: payload.code, status: response.status });
  return payload;
}

export function companionHealth() {
  return request("/health");
}

export function openCompanion() {
  window.open(`${COMPANION_URL}/`, "filzy-companion");
}

export function cancelSwissJob(id) {
  return request(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });
}

export function openSwissJob(id) {
  return request(`/jobs/${encodeURIComponent(id)}/open`, { method: "POST", body: "{}" });
}

export function getSwissJob(id) {
  return request(`/jobs/${encodeURIComponent(id)}`);
}

export function swissTransferId(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)swisstransfer\.com$/i.test(url.hostname)) return "";
    return (url.pathname.match(/^\/d\/([A-Za-z0-9_-]+)/) || [])[1] || "";
  } catch {
    return "";
  }
}

export function filzyTransferUrl(value) {
  const id = swissTransferId(value);
  return id ? `${window.location.origin}/d/${id}` : "";
}

export function swissTransferUrl(id) {
  return `https://www.swisstransfer.com/d/${encodeURIComponent(id)}`;
}

export function flattenTransferItems(items) {
  return items.flatMap((item) => item.kind === "folder" ? item.files : [item.file]).filter(Boolean);
}

function uploadFile(jobId, file, index, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal?.addEventListener("abort", stop, { once: true });
    xhr.open("PUT", `${COMPANION_URL}/jobs/${encodeURIComponent(jobId)}/files/${index}`);
    xhr.setRequestHeader("x-filzy-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-filzy-size", String(file.size));
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded, event.total || file.size);
    xhr.onload = () => {
      signal?.removeEventListener("abort", stop);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = "The file did not reach the local companion.";
        try { message = JSON.parse(xhr.responseText).error || message; } catch { /* keep default */ }
        reject(new CompanionError(message, { status: xhr.status }));
      }
    };
    xhr.onerror = () => reject(new CompanionError("The local companion connection stopped.", { code: "OFFLINE" }));
    xhr.onabort = () => reject(new DOMException("Transfer cancelled", "AbortError"));
    xhr.send(file);
  });
}

export async function startSwissTransfer({ items, expiresInDays, title, message, onProgress, onState, signal }) {
  const files = flattenTransferItems(items);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const job = await request("/jobs", {
    method: "POST",
    body: JSON.stringify({ fileCount: files.length, totalBytes }),
  });
  let completedBytes = 0;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await uploadFile(job.id, file, index, (loaded) => {
        onProgress?.(totalBytes ? Math.min(1, (completedBytes + loaded) / totalBytes) : 1);
      }, signal);
      completedBytes += file.size;
      onProgress?.(totalBytes ? completedBytes / totalBytes : 1);
    }
    const started = await request(`/jobs/${encodeURIComponent(job.id)}/start`, {
      method: "POST",
      body: JSON.stringify({ expiresInDays, title, message }),
    });
    onState?.(started);
    return started;
  } catch (error) {
    void cancelSwissJob(job.id).catch(() => {});
    throw error;
  }
}

export async function waitForSwissTransfer(id, { onState, signal } = {}) {
  while (!signal?.aborted) {
    const job = await getSwissJob(id);
    onState?.(job);
    if (job.state === "complete") return job;
    if (["error", "cancelled"].includes(job.state)) {
      throw new CompanionError(job.error || (job.state === "cancelled" ? "Transfer cancelled." : "SwissTransfer stopped."));
    }
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 700);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Transfer cancelled", "AbortError"));
      }, { once: true });
    });
  }
  throw new DOMException("Transfer cancelled", "AbortError");
}

export { COMPANION_URL };
