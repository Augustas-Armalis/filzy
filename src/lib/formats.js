// Format catalog + conversion matrix for the Converter.
//
// Each format: { value, label, mime, category }. Categories drive which output
// targets are offered for a given input, and which engine runs the conversion
// (canvas for common images; ffmpeg.wasm for audio/video and exotic images).

export const CATEGORIES = ["image", "audio", "video"];

export const FORMATS = [
  // ---- image ----
  { value: "png", label: "PNG", mime: "image/png", category: "image" },
  { value: "jpg", label: "JPG", mime: "image/jpeg", category: "image" },
  { value: "webp", label: "WEBP", mime: "image/webp", category: "image" },
  { value: "avif", label: "AVIF", mime: "image/avif", category: "image" },
  { value: "gif", label: "GIF", mime: "image/gif", category: "image" },
  { value: "bmp", label: "BMP", mime: "image/bmp", category: "image" },
  { value: "tiff", label: "TIFF", mime: "image/tiff", category: "image" },
  { value: "ico", label: "ICO", mime: "image/x-icon", category: "image" },
  { value: "svg", label: "SVG", mime: "image/svg+xml", category: "image" },
  // ---- audio ----
  { value: "mp3", label: "MP3", mime: "audio/mpeg", category: "audio" },
  { value: "wav", label: "WAV", mime: "audio/wav", category: "audio" },
  { value: "ogg", label: "OGG", mime: "audio/ogg", category: "audio" },
  { value: "m4a", label: "M4A", mime: "audio/mp4", category: "audio" },
  { value: "aac", label: "AAC", mime: "audio/aac", category: "audio" },
  { value: "flac", label: "FLAC", mime: "audio/flac", category: "audio" },
  { value: "opus", label: "OPUS", mime: "audio/opus", category: "audio" },
  // ---- video ----
  { value: "mp4", label: "MP4", mime: "video/mp4", category: "video" },
  { value: "webm", label: "WEBM", mime: "video/webm", category: "video" },
  { value: "mov", label: "MOV", mime: "video/quicktime", category: "video" },
  { value: "mkv", label: "MKV", mime: "video/x-matroska", category: "video" },
  { value: "avi", label: "AVI", mime: "video/x-msvideo", category: "video" },
];

const BY_VALUE = Object.fromEntries(FORMATS.map((f) => [f.value, f]));

// Extension aliases → canonical format value.
const ALIAS = { jpeg: "jpg", tif: "tiff", m4v: "mp4", qt: "mov", oga: "ogg", "3gp": "mp4" };

export function formatByValue(v) {
  if (!v) return null;
  const key = ALIAS[v] || v;
  return BY_VALUE[key] || null;
}

export function extOf(file) {
  return (file.name.split(".").pop() || "").toLowerCase();
}

// Best guess at a file's source format (extension first, then mime).
export function detectFormat(file) {
  const ext = ALIAS[extOf(file)] || extOf(file);
  if (BY_VALUE[ext]) return BY_VALUE[ext];
  const mime = file.type || "";
  const byMime = FORMATS.find((f) => f.mime === mime);
  return byMime || null;
}

export function categoryOf(file) {
  const fmt = detectFormat(file);
  if (fmt) return fmt.category;
  const mime = file.type || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return null;
}

// Valid output formats for a given input category. Video inputs additionally
// offer gif + audio-only extraction via ffmpeg.
export function outputsFor(category) {
  if (!category) return FORMATS;
  const same = FORMATS.filter((f) => f.category === category);
  if (category === "video") return [...same, BY_VALUE.gif, BY_VALUE.mp3, BY_VALUE.wav, BY_VALUE.m4a];
  return same;
}

// Formats the browser can both DECODE from and produce purely with <canvas>
// (fast, zero-dependency). Everything else routes through ffmpeg.wasm.
export const CANVAS_OUTPUTS = new Set(["png", "jpg", "webp", "avif"]);
export const CANVAS_INPUTS = new Set(["png", "jpg", "webp", "avif", "gif", "bmp", "svg", "ico"]);

// Accept string for the <input type=file> on the converter.
export const CONVERT_ACCEPT = "image/*,audio/*,video/*";
