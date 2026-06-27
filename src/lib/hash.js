// SHA-256 helpers. Used for optional end-to-end integrity verification of a
// received file (the WebRTC data channel is already reliable + ordered, so this
// is belt-and-suspenders and only runs when the sender advertises a hash).

export function bufToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export async function sha256Hex(data) {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bufToHex(digest);
}
