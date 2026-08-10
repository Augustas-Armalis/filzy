import { flattenTransferItems, hostedTransferId } from "./transferCompanion";

const POOL_API = import.meta.env.VITE_POOL_API || "https://filzy-signaling.sendfilzy-cdf.workers.dev";

function token(bytes = 16) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function poolRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${POOL_API}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("The Filzy pool service could not be reached.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The pool could not be updated.");
  return payload;
}

export async function createPool({ name, expiresInDays, password = "", maxDownloads = 0 }) {
  const id = token(12);
  const ownerSecret = token(24);
  const pool = await poolRequest(`/pool/${id}/init`, {
    method: "POST",
    body: JSON.stringify({ name, expiresInDays, ownerSecret, password, maxDownloads }),
  });
  localStorage.setItem(`filzy-pool-owner:${id}`, ownerSecret);
  return { id, ownerSecret, pool };
}

export function getPool(id, accessToken = "") {
  const query = accessToken ? `?access=${encodeURIComponent(accessToken)}` : "";
  return poolRequest(`/pool/${encodeURIComponent(id)}${query}`);
}

export function unlockPool(id, password) {
  return poolRequest(`/pool/${encodeURIComponent(id)}/unlock`, { method: "POST", body: JSON.stringify({ password }) });
}

export function closePool(id, ownerSecret) {
  return poolRequest(`/pool/${encodeURIComponent(id)}/close`, { method: "POST", body: JSON.stringify({ ownerSecret }) });
}

export function addPoolTransfer(id, transfer, items) {
  const transferId = hostedTransferId(transfer.transferUrl);
  const files = flattenTransferItems(items).map((file) => ({ name: file.name, size: file.size, kind: file.type || "file" }));
  return poolRequest(`/pool/${encodeURIComponent(id)}/batches`, {
    method: "POST",
    body: JSON.stringify({ transferId, files, access: transfer.access }),
  });
}

export function poolFileUrl(id, batchId, index, accessToken = "") {
  const query = accessToken ? `?access=${encodeURIComponent(accessToken)}` : "";
  return `${POOL_API}/pool/${encodeURIComponent(id)}/files/${encodeURIComponent(batchId)}/${index}${query}`;
}

export function poolShareUrl(id) {
  return `${window.location.origin}/p/${id}`;
}

export function ownerSecretForPool(id) {
  return localStorage.getItem(`filzy-pool-owner:${id}`) || "";
}

export { POOL_API };
