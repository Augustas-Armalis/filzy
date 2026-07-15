/*
  Media extractor helpers.

  Platform detection runs entirely client-side (regex on the pasted URL) so the
  UI reacts instantly. The actual media grab, however, CANNOT run in the browser
  — YouTube & co. block cross-origin stream access and cipher their URLs — so it
  is delegated to a Cloudflare Worker (yt-dlp-style) at VITE_EXTRACT_API. Until
  that Worker is deployed, requestExtraction returns a structured "not connected"
  result so the page can say so honestly instead of hanging.
*/

export const EXTRACT_API = import.meta.env.VITE_EXTRACT_API || "";

const PLATFORMS = [
  { id: "youtube", label: "YouTube", color: "#FF0000", match: /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i, idIndex: 1 },
  { id: "tiktok", label: "TikTok", color: "#000000", match: /tiktok\.com\/(@[\w.]+\/video\/(\d+)|t\/\w+)/i },
  { id: "instagram", label: "Instagram", color: "#E1306C", match: /instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/i },
  { id: "x", label: "X / Twitter", color: "#000000", match: /(?:twitter|x)\.com\/\w+\/status\/(\d+)/i },
  { id: "facebook", label: "Facebook", color: "#1877F2", match: /(?:facebook\.com|fb\.watch)\/[\w./?=&-]+/i },
  { id: "soundcloud", label: "SoundCloud", color: "#FF5500", match: /soundcloud\.com\/[\w-]+\/[\w-]+/i },
  { id: "vimeo", label: "Vimeo", color: "#1AB7EA", match: /vimeo\.com\/(\d+)/i },
  { id: "twitch", label: "Twitch", color: "#9146FF", match: /twitch\.tv\/(?:videos\/\d+|\w+\/clip\/[\w-]+)/i },
  { id: "reddit", label: "Reddit", color: "#FF4500", match: /reddit\.com\/r\/\w+\/comments\/\w+/i },
  { id: "dailymotion", label: "Dailymotion", color: "#0066DC", match: /dailymotion\.com\/video\/(\w+)/i },
];

// Detect a URL's platform. Returns { id, label, color, videoId?, thumbnail?, url } or null.
export function detectPlatform(raw) {
  const url = (raw || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  for (const p of PLATFORMS) {
    const m = url.match(p.match);
    if (m) {
      const videoId = p.idIndex ? m[p.idIndex] : m[1];
      const thumbnail = p.id === "youtube" && videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
      return { id: p.id, label: p.label, color: p.color, videoId, thumbnail, url };
    }
  }
  return { id: "link", label: "Link", color: "#6F747B", url };
}

export const FORMAT_OPTS = [
  { value: "mp4", label: "MP4 · Video" },
  { value: "mp3", label: "MP3 · Audio" },
];

export const QUALITY_OPTS = {
  mp4: [
    { value: "best", label: "Best" },
    { value: "1080", label: "1080p" },
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
  ],
  mp3: [
    { value: "320", label: "320 kbps" },
    { value: "256", label: "256 kbps" },
    { value: "128", label: "128 kbps" },
  ],
};

// Ask the Worker to extract. Resolves to { ok, url?, filename?, reason?, message? }.
export async function requestExtraction({ url, format, quality }) {
  if (!EXTRACT_API) {
    return { ok: false, reason: "backend", message: "Extractor backend not connected yet." };
  }
  try {
    const res = await fetch(`${EXTRACT_API}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format, quality }),
    });
    if (!res.ok) return { ok: false, reason: "server", message: `Server error (${res.status})` };
    const data = await res.json();
    if (!data?.url) return { ok: false, reason: "server", message: data?.message || "No media found" };
    return { ok: true, url: data.url, filename: data.filename };
  } catch (err) {
    return { ok: false, reason: "network", message: err?.message || "Request failed" };
  }
}
