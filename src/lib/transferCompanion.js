const LINK_API = import.meta.env.VITE_DROP_API || "https://filzy-signaling.sendfilzy-cdf.workers.dev";
const TRANSFER_API = `${LINK_API}/transfer`;
const MAX_TRANSFER_BYTES = 25 * 1024 ** 3;
const MAX_TRANSFER_FILES = 500;
const VISITOR_TOKEN_KEY = "filzy-transfer-visitor-v1";
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

function visitorToken() {
  try {
    const saved = localStorage.getItem(VISITOR_TOKEN_KEY);
    if (saved) return saved;
    const created = randomToken();
    localStorage.setItem(VISITOR_TOKEN_KEY, created);
    return created;
  } catch {
    return randomToken();
  }
}

function randomJobId() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function apiRequest(path, { method = "POST", body, visitor, owner, signal } = {}) {
  let response;
  try {
    response = await fetch(`${TRANSFER_API}${path}`, {
      method,
      signal,
      headers: {
        "content-type": "application/json",
        ...(visitor ? { "x-visitor-token": visitor } : {}),
        ...(owner ? { authorization: `Owner ${owner}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new TransferError("The Filzy upload service could not be reached.", { code: "OFFLINE" });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message = response.status === 429
      ? "The free upload allowance is busy right now. Please try again shortly."
      : payload.error || "The upload could not finish. Please try again.";
    throw new TransferError(message, { status: response.status });
  }
  return payload;
}

function normalizedUploadHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => {
    if (["host", "content-length"].includes(name.toLowerCase())) return [];
    return [[name, Array.isArray(value) ? value[0] : value]];
  }));
}

function uploadBlob(url, blob, { headers, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const stop = () => xhr.abort();
    signal?.addEventListener("abort", stop, { once: true });
    xhr.open("PUT", url);
    Object.entries(normalizedUploadHeaders(headers)).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded, event.total || blob.size);
    const cleanup = () => signal?.removeEventListener("abort", stop);
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader("etag") || "" });
      else reject(new TransferError("A file upload could not finish. Please try again.", { status: xhr.status }));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TransferError("The connection stopped. Please try again.", { code: "OFFLINE" }));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Transfer cancelled", "AbortError"));
    };
    xhr.send(blob);
  });
}

async function multipartUrls(upload, partNumbers, { visitor, signal }) {
  const initial = new Map(Object.entries(upload.initial_urls || {}).map(([part, url]) => [Number(part), url]));
  const missing = partNumbers.filter((part) => !initial.has(part));
  for (let offset = 0; offset < missing.length; offset += 100) {
    const response = await apiRequest("/upload/parts", {
      body: { upload_id: upload.upload_id, part_numbers: missing.slice(offset, offset + 100) },
      visitor,
      owner: upload.owner_token,
      signal,
    });
    (response.part_urls || []).forEach((entry) => initial.set(Number(entry.partNumber), entry.url));
  }
  if (partNumbers.some((part) => !initial.has(part))) throw new TransferError("Filzy could not prepare every upload part. Please try again.");
  return initial;
}

async function uploadFile(file, { collectionId, expiresInDays, maxDownloads, visitor, signal, onProgress }) {
  const upload = await apiRequest("/upload/init", {
    visitor,
    signal,
    body: { filename: file.name, content_type: file.type || "application/octet-stream", size: file.size },
  });

  try {
    if (upload.type === "multipart") {
      const partNumbers = Array.from({ length: upload.total_parts }, (_, index) => index + 1);
      const urls = await multipartUrls(upload, partNumbers, { visitor, signal });
      const loadedByPart = new Map();
      const parts = new Array(upload.total_parts);
      let cursor = 0;
      const worker = async () => {
        while (cursor < partNumbers.length) {
          const partNumber = partNumbers[cursor++];
          const start = (partNumber - 1) * upload.part_size;
          const blob = file.slice(start, Math.min(file.size, start + upload.part_size));
          const result = await uploadBlob(urls.get(partNumber), blob, {
            signal,
            onProgress: (loaded) => {
              loadedByPart.set(partNumber, loaded);
              onProgress?.([...loadedByPart.values()].reduce((sum, value) => sum + value, 0));
            },
          });
          if (!result.etag) throw new TransferError("A multipart upload response was incomplete. Please try again.");
          parts[partNumber - 1] = { partNumber, etag: result.etag };
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, upload.total_parts) }, worker));
      await apiRequest("/upload/complete-multipart", {
        visitor,
        owner: upload.owner_token,
        signal,
        body: { upload_id: upload.upload_id, parts },
      });
    } else {
      await uploadBlob(upload.upload_url, file, { headers: upload.headers, signal, onProgress: (loaded) => onProgress?.(loaded) });
    }

    const confirmed = await apiRequest("/upload/confirm", {
      visitor,
      signal,
      body: {
        filename: file.name,
        size: file.size,
        content_type: file.type || "application/octet-stream",
        r2_key: upload.r2_key,
        collection_id: collectionId,
      },
    });
    await apiRequest(`/file/${encodeURIComponent(confirmed.file.id)}/expiry`, {
      visitor,
      owner: confirmed.owner_token,
      signal,
      body: { days: expiresInDays },
    });
    if (maxDownloads) {
      await apiRequest(`/file/${encodeURIComponent(confirmed.file.id)}/max-downloads`, {
        visitor,
        owner: confirmed.owner_token,
        signal,
        body: { max_downloads: maxDownloads },
      });
    }
    return confirmed.file;
  } catch (error) {
    if (upload.type === "multipart" && upload.upload_id) {
      apiRequest("/upload/abort", {
        visitor,
        owner: upload.owner_token,
        body: { upload_id: upload.upload_id },
      }).catch(() => {});
    }
    throw error;
  }
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
  if (totalBytes > MAX_TRANSFER_BYTES) throw new TransferError("A transfer can contain up to 25 GB.");
  if (![1, 7].includes(Number(expiresInDays))) throw new TransferError("Choose a 1 or 7 day expiry.");
  if (maxDownloads && (!Number.isInteger(Number(maxDownloads)) || Number(maxDownloads) < 1 || Number(maxDownloads) > 1000)) {
    throw new TransferError("Choose a download limit between 1 and 1000.");
  }

  const id = randomJobId();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const visitor = visitorToken();
  const job = { id, state: "opening", transferProgress: 0, transferUrl: "", error: "", controller };
  jobs.set(id, job);
  onState?.({ ...job, controller: undefined });
  let collection;

  try {
    collection = await apiRequest("/collection", {
      visitor,
      signal: controller.signal,
      body: { expected_file_count: files.length },
    });
    job.transferUrl = collection.collection.url;
    job.state = "uploading";
    onState?.({ ...job, controller: undefined });
    await apiRequest(`/collection/${encodeURIComponent(collection.collection.id)}/expiry`, {
      visitor,
      owner: collection.owner_token,
      signal: controller.signal,
      body: { days: Number(expiresInDays) },
    });
    if (maxDownloads) {
      await apiRequest(`/collection/${encodeURIComponent(collection.collection.id)}/max-downloads`, {
        visitor,
        owner: collection.owner_token,
        signal: controller.signal,
        body: { max_downloads: Number(maxDownloads) },
      });
    }

    let completedBytes = 0;
    const uploadedFiles = [];
    for (const file of files) {
      const uploaded = await uploadFile(file, {
        collectionId: collection.collection.id,
        expiresInDays: Number(expiresInDays),
        maxDownloads: Number(maxDownloads) || 0,
        visitor,
        signal: controller.signal,
        onProgress: (loaded) => {
          const progress = totalBytes ? Math.min(1, (completedBytes + loaded) / totalBytes) : 1;
          job.transferProgress = progress;
          onProgress?.(progress);
          onState?.({ ...job, controller: undefined });
        },
      });
      uploadedFiles.push({ id: uploaded.id, name: uploaded.filename || file.name });
      completedBytes += file.size;
    }
    await apiRequest(`/collection/${encodeURIComponent(collection.collection.id)}/ready`, {
      visitor,
      owner: collection.owner_token,
      signal: controller.signal,
      body: {},
    });

    job.state = "complete";
    job.transferProgress = 1;
    job.access = { provider: "temporary", files: uploadedFiles };
    onProgress?.(1);
    onState?.({ ...job, controller: undefined });
    return { ...job, controller: undefined };
  } catch (error) {
    if (collection?.collection?.id && collection.owner_token) {
      apiRequest(`/collection/${encodeURIComponent(collection.collection.id)}`, {
        method: "DELETE",
        visitor,
        owner: collection.owner_token,
      }).catch(() => {});
    }
    if (error?.name === "AbortError") {
      job.state = "cancelled";
      throw error;
    }
    job.state = "error";
    job.error = error?.message || "The upload could not finish. Please try again.";
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
  throw new TransferError(job.error || "The upload could not finish. Please try again.");
}

export async function cancelTransferJob(id) {
  const job = jobs.get(id);
  if (!job) return { ok: true };
  job.state = "cancelled";
  job.controller.abort();
  return { ok: true };
}
