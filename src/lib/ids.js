import { customAlphabet } from "nanoid";

// URL-safe, unambiguous alphabet (no 0/O/1/l/I confusion).
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const nano = customAlphabet(ALPHABET, 8);

// 8-char id for the share link: filzy.site/s/{beamId}
export function beamId() {
  return nano();
}

// A per-tab peer id used internally by the signaling/transport layer.
export function selfId() {
  return nano();
}
