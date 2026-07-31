import { flattenTransferItems, hostedTransferId } from "./transferCompanion";

const DROP_API = import.meta.env.VITE_DROP_API || "https://filzy-signaling.sendfilzy-cdf.workers.dev";

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${DROP_API}${path}`, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  } catch {
    throw new Error("The Filzy link service could not be reached.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The Filzy link could not be created.");
  return payload;
}

export async function createDropShare({ transfer, items, note, expiresInDays }) {
  const id = shortId();
  const transferId = hostedTransferId(transfer.transferUrl);
  const files = flattenTransferItems(items).map((file) => ({ name: file.name, size: file.size, kind: file.type || "file" }));
  await request(`/drop/${id}/init`, {
    method: "POST",
    body: JSON.stringify({ transferId, files, access: transfer.access, note, expiresInDays }),
  });
  return { id, shareUrl: `${window.location.origin}/d/${id}` };
}

export function getDropShare(id) {
  return request(`/drop/${encodeURIComponent(id)}`);
}

export function dropFileUrl(id, index) {
  return `${DROP_API}/drop/${encodeURIComponent(id)}/files/${index}`;
}

export { DROP_API };
