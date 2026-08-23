const LINK_API = import.meta.env.VITE_DROP_API || "https://filzy-signaling.sendfilzy-cdf.workers.dev";
const MAX_TRANSFER_BYTES = 900 * 1024 ** 2;
const MAX_TRANSFER_FILES = 500;
const UPLOAD_CHUNK_BYTES = 1024 ** 2;
const jobs = new Map();

export class TransferError extends Error {
  constructor(message, { code = "", status = 0 } = {}) {
    super(message);
    this.name = "TransferError";
    this.code = code;
    this.status = status;
  }
}

function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomJobId() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function apiRequest(path, { method = "POST", body, owner, signal } = {}) {
  let response;
  try {
    response = await fetch(`${LINK_API}${path}`, {
      method,
      signal,
      headers: {
        "content-type": "application/json",
        ...(owner ? { "x-owner-secret": owner } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new TransferError("The Filzy upload service could not be reached. Check your connection and try again.", { code: "OFFLINE" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 429
      ? "The free upload allowance is busy right now. Try again shortly."
      : payload.error || "The upload could not finish. Try again.";
    throw new TransferError(message, { status: response.status });
  }
  return payload;
}

function uploadChunk(url, blob, { owner, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal?.addEventListener("abort", stop, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-owner-secret", owner);
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded, event.total || blob.size);
    const cleanup = () => signal?.removeEventListener("abort", stop);
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = "A file upload could not finish. Try again.";
        try { message = JSON.parse(xhr.responseText)?.error || message; } catch { /* keep the useful fallback */ }
        reject(new TransferError(message, { status: xhr.status }));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TransferError("The connection stopped during upload. Try again.", { code: "OFFLINE" }));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Transfer cancelled", "AbortError"));
    };
    xhr.send(blob);
  });
}

async function uploadFile(file, fileIndex, transferId, ownerSecret, { signal, onProgress }) {
  const partCount = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES));
  const loadedByPart = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < partCount) {
      const part = cursor++;
      const start = part * UPLOAD_CHUNK_BYTES;
      const blob = file.slice(start, Math.min(file.size, start + UPLOAD_CHUNK_BYTES));
      await uploadChunk(`${LINK_API}/store/${encodeURIComponent(transferId)}/files/${fileIndex}/chunks/${part}`, blob, {
        owner: ownerSecret,
        signal,
        onProgress: (loaded) => {
          loadedByPart.set(part, loaded);
          onProgress?.([...loadedByPart.values()].reduce((sum, value) => sum + value, 0));
        },
      });
      loadedByPart.set(part, blob.size);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, partCount) }, worker));
}

export function hostedTransferId(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)storage\.to$/i.test(url.hostname)) return "";
    const id = (url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)/) || [])[1] || "";
    return id ? `t-${id}` : "";
  } catch {
    return "";
  }
}

export function flattenTransferItems(items) {
  return items.flatMap((item) => item.kind === "folder" ? item.files : [item.file]).filter(Boolean);
}

export async function startHostedTransfer({ items, expiresInDays = 7, maxDownloads = 0, onProgress, onState, signal }) {
  const files = flattenTransferItems(items);
  if (!files.length) throw new TransferError("Add at least one file first.");
  if (files.length > MAX_TRANSFER_FILES) throw new TransferError(`Choose up to ${MAX_TRANSFER_FILES} files per transfer.`);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TRANSFER_BYTES) throw new TransferError("A Drop or Pool upload can contain up to 900 MB.");
  if (![1, 7].includes(Number(expiresInDays))) throw new TransferError("Choose a 1 or 7 day expiry.");
  if (maxDownloads && (!Number.isInteger(Number(maxDownloads)) || Number(maxDownloads) < 1 || Number(maxDownloads) > 1000)) {
    throw new TransferError("Choose a download limit between 1 and 1000.");
  }

  const id = randomJobId();
  const transferId = randomToken(24);
  const ownerSecret = randomToken(32);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const job = { id, state: "opening", transferProgress: 0, transferUrl: "", error: "", controller };
  jobs.set(id, job);
  onState?.({ ...job, controller: undefined });
  let opened = false;

  try {
    await apiRequest(`/store/${encodeURIComponent(transferId)}/init`, {
      owner: ownerSecret,
      signal: controller.signal,
      body: {
        ownerSecret,
        expiresInDays: Number(expiresInDays),
        files: files.map((file) => ({ name: file.name, size: file.size, kind: file.type || "application/octet-stream" })),
      },
    });
    opened = true;
    job.state = "uploading";
    onState?.({ ...job, controller: undefined });

    let completedBytes = 0;
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      await uploadFile(file, fileIndex, transferId, ownerSecret, {
        signal: controller.signal,
        onProgress: (loaded) => {
          const progress = totalBytes ? Math.min(1, (completedBytes + loaded) / totalBytes) : 1;
          job.transferProgress = progress;
          onProgress?.(progress);
          onState?.({ ...job, controller: undefined });
        },
      });
      completedBytes += file.size;
    }

    await apiRequest(`/store/${encodeURIComponent(transferId)}/complete`, {
      owner: ownerSecret,
      signal: controller.signal,
      body: {},
    });

    job.state = "complete";
    job.transferProgress = 1;
    job.transferUrl = `filzy:${transferId}`;
    job.access = {
      provider: "filzy",
      transferId,
      files: files.map((file) => ({ name: file.name })),
    };
    onProgress?.(1);
    onState?.({ ...job, controller: undefined });
    return { ...job, controller: undefined };
  } catch (error) {
    if (opened) {
      apiRequest(`/store/${encodeURIComponent(transferId)}`, { method: "DELETE", owner: ownerSecret }).catch(() => {});
    }
    if (error?.name === "AbortError") {
      job.state = "cancelled";
      throw error;
    }
    job.state = "error";
    job.error = error?.message || "The upload could not finish. Try again.";
    throw new TransferError(job.error, { code: error?.code, status: error?.status });
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export async function waitForHostedTransfer(id, { onState, signal } = {}) {
  if (signal?.aborted) throw new DOMException("Transfer cancelled", "AbortError");
  const job = jobs.get(id);
  if (!job) throw new TransferError("This upload is no longer available.");
  const value = { ...job, controller: undefined };
  onState?.(value);
  if (job.state === "complete") return value;
  if (job.state === "cancelled") throw new DOMException("Transfer cancelled", "AbortError");
  throw new TransferError(job.error || "The upload could not finish. Try again.");
}

export async function cancelTransferJob(id) {
  const job = jobs.get(id);
  if (!job) return { ok: true };
  job.state = "cancelled";
  job.controller.abort();
  return { ok: true };
}
