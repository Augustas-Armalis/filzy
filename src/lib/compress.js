import { loadFFmpeg, onFFmpegProgress, fileToUint8 } from "@/lib/ffmpeg";
import { extOf } from "@/lib/formats";

/*
  Client-side video compressor. Given a target size (MB) or a percentage of the
  original, we estimate a video bitrate from the clip's duration and re-encode
  with ffmpeg (H.264 + AAC) capped to that bitrate. Optional downscaling helps
  hit aggressive targets. All in-browser — free, no upload.
*/

// Platform upload caps (MB). The preset targets slightly under each cap to
// leave headroom for container overhead so the file actually fits.
export const PRESETS = [
  { id: "discord", label: "Discord", mb: 10, sub: "Free 10 MB" },
  { id: "email", label: "Email", mb: 25, sub: "Gmail / Outlook 25 MB" },
  { id: "whatsapp", label: "WhatsApp", mb: 16, sub: "16 MB video" },
  { id: "nitro", label: "Discord Nitro", mb: 50, sub: "50 MB boost" },
];

const AUDIO_KBPS = 128; // AAC audio bitrate we keep

// Read a video's duration (seconds) + dimensions from its metadata.
export function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const info = { duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 };
      URL.revokeObjectURL(url);
      resolve(info);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: 0, width: 0, height: 0 });
    };
    v.src = url;
  });
}

// Given a target byte budget and duration, the video bitrate (kbps) to request.
function videoKbpsFor(targetBytes, duration) {
  if (!duration) return 1200; // fallback if metadata was unreadable
  const totalKbits = (targetBytes * 8) / 1000;
  const budget = totalKbits * 0.96; // container/muxing overhead headroom
  const perSec = budget / duration;
  const vid = perSec - AUDIO_KBPS;
  return Math.max(120, Math.round(vid)); // floor so it never goes absurdly low
}

// opts: { mode: "size"|"percent", mb?, percent?, scale?: 0|1080|720|480, onStatus, onProgress }
export async function compressVideo(file, opts = {}) {
  const { mode = "size", mb = 10, percent = 50, scale = 0, onStatus, onProgress } = opts;

  onStatus?.("Reading video…");
  const meta = await probeVideo(file);

  const targetBytes = mode === "percent" ? file.size * (Math.max(1, Math.min(99, percent)) / 100) : mb * 1024 * 1024;
  const vKbps = videoKbpsFor(targetBytes, meta.duration);

  const ffmpeg = await loadFFmpeg(onStatus);
  onFFmpegProgress((p) => onProgress?.(p));

  const inName = `in.${extOf(file) || "mp4"}`;
  const base = file.name.replace(/\.[^.]+$/, "") || "video";
  const outName = `${base}-filzy.mp4`;
  await ffmpeg.writeFile(inName, await fileToUint8(file));

  const vf = [];
  if (scale && meta.height && meta.height > scale) vf.push(`scale=-2:${scale}`);

  const args = [
    "-i", inName,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", `${vKbps}k`,
    "-maxrate", `${Math.round(vKbps * 1.45)}k`,
    "-bufsize", `${Math.round(vKbps * 2)}k`,
    "-pix_fmt", "yuv420p",
    ...(vf.length ? ["-vf", vf.join(",")] : []),
    "-c:a", "aac",
    "-b:a", `${AUDIO_KBPS}k`,
    "-movflags", "+faststart",
    outName,
  ];

  onStatus?.("Compressing…");
  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outName);
  await ffmpeg.deleteFile(inName).catch(() => {});
  await ffmpeg.deleteFile(outName).catch(() => {});
  onStatus?.("");

  return { blob: new Blob([data.buffer], { type: "video/mp4" }), name: outName, targetBytes };
}
