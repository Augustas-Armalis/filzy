import { cancelFFmpeg, fileToUint8, loadFFmpeg, onFFmpegProgress } from "@/lib/ffmpeg";
import { categoryOf, extOf, FORMAT_GROUPS, normalizeFormatValue } from "@/lib/formats";
import { convertFile } from "@/lib/convert";

export const PRESETS = [
  { id: "discord", label: "Discord", mb: 10 },
  { id: "email", label: "Email", mb: 25 },
];

const MEDIA_GROUPS = new Set(["image", "video", "audio"]);
const MEDIA_EXTENSIONS = FORMAT_GROUPS
  .filter(({ id }) => MEDIA_GROUPS.has(id))
  .flatMap(({ values }) => values)
  .map((value) => `.${value}`);

export const COMPRESS_ACCEPT = ["image/*", "video/*", "audio/*", ".svg", ...MEDIA_EXTENSIONS].join(",");

const VIDEO_HEIGHTS = [2160, 1080, 720, 480, 360];
const AUDIO_BITRATES = [320, 256, 192, 160, 128, 96, 64, 48, 32];

const DEFAULT_SETTINGS = {
  videoResolution: "auto",
  videoFps: "auto",
  videoBitrate: "auto",
  videoQuality: "balanced",
  keepAudio: true,
  videoAudioBitrate: 128,
  imageFormat: "auto",
  imageDimension: "auto",
  imageQuality: "auto",
  audioFormat: "mp3",
  audioBitrate: "auto",
  audioSampleRate: "original",
  audioChannels: "original",
};

export function defaultCompressionSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function isCompressibleMedia(file) {
  return MEDIA_GROUPS.has(categoryOf(file));
}

function abortError() {
  return new DOMException("Compression cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function compressionTargetBytes(file, { mode = "size", mb = 10, percent = 50 } = {}) {
  if (mode === "percent") return Math.max(1, Math.round(file.size * (clamp(Number(percent) || 50, 1, 99) / 100)));
  return Math.max(1, Math.round((Number(mb) || 10) * 1024 * 1024));
}

function probePlayable(file, kind) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(kind === "audio" ? "audio" : "video");
    media.preload = "metadata";
    media.muted = true;
    const finish = (metadata) => {
      URL.revokeObjectURL(url);
      media.removeAttribute("src");
      resolve(metadata);
    };
    media.onloadedmetadata = () => finish({
      category: kind,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      width: media.videoWidth || 0,
      height: media.videoHeight || 0,
    });
    media.onerror = () => finish({ category: kind, duration: 0, width: 0, height: 0 });
    media.src = url;
  });
}

function probeImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ category: "image", duration: 0, width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ category: "image", duration: 0, width: 0, height: 0 });
    };
    image.src = url;
  });
}

export function probeMedia(file) {
  const category = categoryOf(file);
  if (category === "video" || category === "audio") return probePlayable(file, category);
  if (category === "image") return probeImage(file);
  return Promise.resolve({ category: null, duration: 0, width: 0, height: 0 });
}

export const probeVideo = (file) => probePlayable(file, "video");

function sourceBitrateKbps(file, duration) {
  if (!duration) return 1600;
  return Math.max(32, (file.size * 8) / 1000 / duration);
}

function chosenHeight(sourceHeight, requested, videoKbps) {
  if (requested && requested !== "auto" && requested !== "original") return Math.min(sourceHeight || Number(requested), Number(requested));
  if (requested === "original") return 0;
  const smart = videoKbps >= 7000 ? 2160 : videoKbps >= 2800 ? 1080 : videoKbps >= 1300 ? 720 : videoKbps >= 650 ? 480 : 360;
  return sourceHeight ? Math.min(sourceHeight, smart) : smart;
}

function chosenFps(requested, videoKbps) {
  if (requested && requested !== "auto" && requested !== "original") return Number(requested);
  if (requested === "original") return 0;
  return videoKbps < 700 ? 24 : 30;
}

export function planVideoCompression(file, meta = {}, opts = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const targetBytes = compressionTargetBytes(file, opts);
  const duration = meta.duration || 0;
  const totalKbps = duration ? (targetBytes * 8 * 0.94) / 1000 / duration : 1400;
  const audioKbps = settings.keepAudio ? Math.min(Number(settings.videoAudioBitrate) || 128, Math.max(48, totalKbps * 0.22)) : 0;
  const smartBitrate = Math.max(120, Math.round(totalKbps - audioKbps));
  const sourceVideoKbps = Math.max(120, sourceBitrateKbps(file, duration) - audioKbps);
  const manualScale = dimensionScale(meta, settings.videoResolution) ** 2;
  const manualFps = settings.videoFps === "auto" || settings.videoFps === "original" ? 1 : Math.min(1, Number(settings.videoFps) / 30);
  const manualQuality = settings.videoQuality === "best" ? 0.9 : settings.videoQuality === "fast" ? 0.68 : 0.78;
  const inferredBitrate = Math.max(120, Math.round(sourceVideoKbps * Math.max(0.12, manualScale) * manualFps * manualQuality));
  const automaticBitrate = opts.smartTarget === false ? inferredBitrate : smartBitrate;
  const videoKbps = settings.videoBitrate === "auto" || !Number(settings.videoBitrate)
    ? automaticBitrate
    : clamp(Number(settings.videoBitrate), 120, 50_000);
  return {
    targetBytes,
    videoKbps,
    audioKbps: Math.round(audioKbps),
    height: chosenHeight(meta.height || 0, settings.videoResolution, videoKbps),
    fps: chosenFps(settings.videoFps, videoKbps),
    quality: settings.videoQuality,
    smartBitrate: settings.videoBitrate === "auto" || !Number(settings.videoBitrate),
  };
}

function selectedAudioBitrate(file, meta, opts, settings) {
  if (settings.audioBitrate !== "auto" && Number(settings.audioBitrate)) return clamp(Number(settings.audioBitrate), 24, 512);
  if (opts.smartTarget === false) return Math.min(192, Math.round(sourceBitrateKbps(file, meta.duration)));
  const targetBytes = compressionTargetBytes(file, opts);
  if (!meta.duration) return 128;
  const allowed = (targetBytes * 8 * 0.96) / 1000 / meta.duration;
  return AUDIO_BITRATES.find((bitrate) => bitrate <= allowed) || 32;
}

function dimensionScale(meta, requested) {
  if (!meta?.width || !meta?.height || requested === "auto" || requested === "original") return 1;
  return Math.min(1, Number(requested) / Math.max(meta.width, meta.height));
}

export function estimateCompressedBytes(file, meta = {}, settingsInput = {}, smartTarget = true, target = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...settingsInput };
  if (smartTarget) return Math.min(file.size, compressionTargetBytes(file, target));
  const category = categoryOf(file);
  if (category === "video") {
    const sourceKbps = sourceBitrateKbps(file, meta.duration);
    const resolutionFactor = dimensionScale(meta, settings.videoResolution) ** 2;
    const fpsFactor = settings.videoFps === "auto" || settings.videoFps === "original" ? 1 : Math.min(1, Number(settings.videoFps) / 30);
    const qualityFactor = settings.videoQuality === "best" ? 0.9 : settings.videoQuality === "fast" ? 0.68 : 0.78;
    const inferredVideo = Math.max(120, sourceKbps * Math.max(0.12, resolutionFactor) * fpsFactor * qualityFactor);
    const videoKbps = settings.videoBitrate === "auto" ? inferredVideo : Number(settings.videoBitrate) || inferredVideo;
    const audioKbps = settings.keepAudio ? Number(settings.videoAudioBitrate) || 128 : 0;
    return meta.duration ? Math.round(((videoKbps + audioKbps) * 1000 * meta.duration) / 8) : Math.round(file.size * qualityFactor);
  }
  if (category === "audio") {
    const bitrate = settings.audioBitrate === "auto" ? Math.min(192, sourceBitrateKbps(file, meta.duration)) : Number(settings.audioBitrate) || 128;
    return meta.duration ? Math.round((bitrate * 1000 * meta.duration) / 8) : Math.round(file.size * Math.min(1, bitrate / 256));
  }
  if (category === "image") {
    const scale = dimensionScale(meta, settings.imageDimension);
    const quality = settings.imageQuality === "auto" ? 0.84 : clamp(Number(settings.imageQuality) / 100, 0.2, 1);
    const source = normalizeFormatValue(extOf(file));
    const targetFormat = settings.imageFormat === "same" ? source : settings.imageFormat;
    const formatFactor = targetFormat === "avif" ? 0.48 : targetFormat === "webp" || targetFormat === "auto" ? 0.58 : targetFormat === "jpg" ? 0.72 : 0.9;
    return Math.max(1024, Math.round(file.size * scale ** 2 * (0.35 + quality * 0.65) * formatFactor));
  }
  return file.size;
}

function outputName(file, extension) {
  const base = file.name.replace(/\.[^.]+$/, "") || "media";
  return `${base}-filzy.${extension}`;
}

function videoPreset(value) {
  if (value === "best") return "medium";
  if (value === "fast") return "ultrafast";
  return "veryfast";
}

async function runFfmpeg(file, outName, argsFor, { signal, onStatus, onProgress }) {
  throwIfAborted(signal);
  const cancel = () => cancelFFmpeg();
  signal?.addEventListener("abort", cancel, { once: true });
  let ffmpeg;
  const inName = `compress-in.${extOf(file) || "bin"}`;
  try {
    ffmpeg = await loadFFmpeg(onStatus);
    throwIfAborted(signal);
    onFFmpegProgress((progress) => onProgress?.(progress));
    await ffmpeg.writeFile(inName, await fileToUint8(file));
    throwIfAborted(signal);
    await ffmpeg.exec(argsFor(inName, outName));
    throwIfAborted(signal);
    const data = await ffmpeg.readFile(outName);
    return new Uint8Array(data);
  } finally {
    signal?.removeEventListener("abort", cancel);
    await ffmpeg?.deleteFile(inName).catch(() => {});
    await ffmpeg?.deleteFile(outName).catch(() => {});
  }
}

async function compressVideoInternal(file, meta, opts) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const plan = planVideoCompression(file, meta, opts);
  const output = outputName(file, "mp4");
  const encode = (videoKbps, progressStart, progressScale) => runFfmpeg(file, output, (input, out) => {
    const filters = [];
    if (plan.height && (!meta.height || meta.height > plan.height)) filters.push(`scale=-2:${plan.height}:flags=lanczos`);
    if (plan.fps) filters.push(`fps=${plan.fps}`);
    return [
      "-i", input,
      "-c:v", "libx264",
      "-preset", videoPreset(plan.quality),
      "-b:v", `${videoKbps}k`,
      "-maxrate", `${Math.round(videoKbps * 1.12)}k`,
      "-bufsize", `${Math.round(videoKbps * 2)}k`,
      "-pix_fmt", "yuv420p",
      ...(filters.length ? ["-vf", filters.join(",")] : []),
      ...(settings.keepAudio ? ["-c:a", "aac", "-b:a", `${plan.audioKbps}k`] : ["-an"]),
      "-movflags", "+faststart",
      out,
    ];
  }, { ...opts, onProgress: (progress) => opts.onProgress?.(progressStart + progress * progressScale) });

  opts.onStatus?.("Compressing video…");
  let bytes = await encode(plan.videoKbps, 0, 0.76);
  if (opts.smartTarget !== false && bytes.length > plan.targetBytes * 1.03) {
    const correctedBitrate = Math.max(120, Math.floor(plan.videoKbps * (plan.targetBytes / bytes.length) * 0.96));
    if (correctedBitrate < plan.videoKbps) {
      opts.onStatus?.("Fine-tuning file size…");
      bytes = await encode(correctedBitrate, 0.76, 0.24);
    }
  }
  opts.onProgress?.(1);
  return { blob: new Blob([bytes], { type: "video/mp4" }), name: output, targetBytes: plan.targetBytes };
}

function audioCodec(format) {
  if (format === "aac") return ["aac", "audio/aac"];
  if (format === "opus") return ["libopus", "audio/opus"];
  return ["libmp3lame", "audio/mpeg"];
}

async function compressAudioInternal(file, meta, opts) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const format = ["mp3", "aac", "opus"].includes(settings.audioFormat) ? settings.audioFormat : "mp3";
  const [codec, mime] = audioCodec(format);
  const bitrate = selectedAudioBitrate(file, meta, opts, settings);
  const output = outputName(file, format);
  opts.onStatus?.("Compressing audio…");
  const bytes = await runFfmpeg(file, output, (input, out) => [
    "-i", input,
    "-vn",
    "-c:a", codec,
    "-b:a", `${bitrate}k`,
    ...(settings.audioSampleRate === "original" ? [] : ["-ar", String(settings.audioSampleRate)]),
    ...(settings.audioChannels === "original" ? [] : ["-ac", settings.audioChannels === "mono" ? "1" : "2"]),
    out,
  ], opts);
  return { blob: new Blob([bytes], { type: mime }), name: output, targetBytes: compressionTargetBytes(file, opts) };
}

function imageOutputFormat(file, requested) {
  const source = normalizeFormatValue(extOf(file));
  if (requested === "same" && ["png", "jpg", "webp", "avif"].includes(source)) return source;
  if (["png", "jpg", "webp", "avif"].includes(requested)) return requested;
  if (["jpg", "webp", "avif"].includes(source)) return source;
  return "webp";
}

async function encodeImage(file, format, quality, maxEdge, opts) {
  const metadata = opts.meta || {};
  const scale = maxEdge && metadata.width && metadata.height ? Math.min(1, maxEdge / Math.max(metadata.width, metadata.height)) : 1;
  const width = metadata.width ? Math.max(1, Math.round(metadata.width * scale)) : null;
  const height = metadata.height ? Math.max(1, Math.round(metadata.height * scale)) : null;
  const result = await convertFile(file, format, {
    quality,
    width,
    height,
    lockAspect: true,
    signal: opts.signal,
    onStatus: opts.onStatus,
    onProgress: opts.onProgress,
  });
  return { ...result, format, width, height };
}

async function compressImageInternal(file, meta, opts) {
  const settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
  const format = imageOutputFormat(file, settings.imageFormat);
  const targetBytes = compressionTargetBytes(file, opts);
  const smart = opts.smartTarget !== false;
  let maxEdge = settings.imageDimension === "auto" || settings.imageDimension === "original" ? Math.max(meta.width || 0, meta.height || 0) || null : Number(settings.imageDimension);
  let quality = settings.imageQuality === "auto" ? 0.9 : clamp(Number(settings.imageQuality) / 100, 0.2, 1);
  opts.onStatus?.("Compressing image…");

  if (!smart) {
    const result = await encodeImage(file, format, quality, maxEdge, { ...opts, meta });
    return { ...result, name: outputName(file, format), targetBytes };
  }

  let best = null;
  for (let sizePass = 0; sizePass < 5; sizePass += 1) {
    let low = 0.32;
    let high = quality;
    for (let qualityPass = 0; qualityPass < 5; qualityPass += 1) {
      throwIfAborted(opts.signal);
      opts.onProgress?.((sizePass * 5 + qualityPass) / 25 * 0.92);
      const candidateQuality = qualityPass === 0 ? high : (low + high) / 2;
      const candidate = await encodeImage(file, format, candidateQuality, maxEdge, { ...opts, meta });
      if (!best || Math.abs(candidate.blob.size - targetBytes) < Math.abs(best.blob.size - targetBytes)) best = candidate;
      if (candidate.blob.size > targetBytes) high = candidateQuality;
      else low = candidateQuality;
    }
    if (best?.blob.size <= targetBytes * 1.03 || !maxEdge || maxEdge <= 320) break;
    const reduction = clamp(Math.sqrt(targetBytes / best.blob.size) * 0.94, 0.56, 0.9);
    maxEdge = Math.max(320, Math.round(maxEdge * reduction));
    quality = 0.88;
  }
  opts.onProgress?.(1);
  return { ...best, name: outputName(file, format), targetBytes };
}

export async function compressMedia(file, opts = {}) {
  const category = categoryOf(file);
  if (!MEDIA_GROUPS.has(category)) throw new Error("Choose an image, video, or audio file");
  throwIfAborted(opts.signal);
  const meta = opts.meta || await probeMedia(file);
  const targetBytes = compressionTargetBytes(file, opts);
  const smart = opts.smartTarget !== false;
  if (smart && file.size <= targetBytes) {
    opts.onStatus?.("");
    opts.onProgress?.(1);
    return { blob: file, name: file.name, targetBytes, unchanged: true };
  }
  if (category === "video") return compressVideoInternal(file, meta, opts);
  if (category === "audio") return compressAudioInternal(file, meta, opts);
  return compressImageInternal(file, meta, opts);
}

export function compressVideo(file, opts = {}) {
  return compressMedia(file, opts);
}
