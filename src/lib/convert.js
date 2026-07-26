import { formatByValue, detectFormat, extOf, sourceValueOf, normalizeFormatValue, categoryOf, CANVAS_OUTPUTS, CANVAS_INPUTS } from "@/lib/formats";
import { loadFFmpeg, cancelFFmpeg, onFFmpegProgress, fileToUint8 } from "@/lib/ffmpeg";
import { traceImageToSvg } from "@/lib/svgTrace";
import { convertTextFile, isTextConversion } from "@/lib/textConvert";
import { imageToPdf } from "@/lib/pdfConvert";

/*
  The conversion engine. Two routes:

  1) CANVAS / VECTOR TRACE — common raster images are decoded by the browser
     and re-encoded to png/jpg/webp/avif, while SVG output is composed from
     actual traced paths and color layers.

  2) FFMPEG (lazy self-hosted WASM) — everything else: all audio, all video,
     exotic image formats, video→gif, and video→audio.

  Every path resolves to { blob, name } so the UI can preview + download.
*/

function outName(file, targetValue) {
  const base = file.name.replace(/\.[^.]+$/, "") || "file";
  const ext = targetValue === "jpg" ? "jpg" : targetValue;
  return `${base}.${ext}`;
}

function abortError() {
  return new DOMException("Conversion cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

// Decode any browser-supported image (incl. SVG) to something drawable.
async function decodeImage(file) {
  const ext = extOf(file);
  if (ext === "svg" || file.type === "image/svg+xml") {
    return await decodeViaImg(file);
  }
  try {
    return await createImageBitmap(file);
  } catch {
    return await decodeViaImg(file);
  }
}

function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

function qualityValue(value) {
  if (typeof value === "number") return Math.max(0.1, Math.min(1, value));
  if (value === "small") return 0.72;
  if (value === "best") return 0.98;
  return 0.9;
}

function outputSize(sourceWidth, sourceHeight, width, height, lockAspect = true) {
  const wantedWidth = Number(width) > 0 ? Number(width) : null;
  const wantedHeight = Number(height) > 0 ? Number(height) : null;
  if (!wantedWidth && !wantedHeight) return { width: sourceWidth, height: sourceHeight };
  if (!lockAspect && wantedWidth && wantedHeight) return { width: wantedWidth, height: wantedHeight };
  if (wantedWidth && wantedHeight) {
    const scale = Math.min(wantedWidth / sourceWidth, wantedHeight / sourceHeight);
    return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)) };
  }
  if (wantedWidth) return { width: wantedWidth, height: Math.max(1, Math.round(sourceHeight * (wantedWidth / sourceWidth))) };
  return { width: Math.max(1, Math.round(sourceWidth * (wantedHeight / sourceHeight))), height: wantedHeight };
}

async function canvasConvert(file, targetValue, { quality = "balanced", width, height, lockAspect = true, signal } = {}) {
  throwIfAborted(signal);
  const src = await decodeImage(file);
  throwIfAborted(signal);
  const sourceWidth = src.width || src.naturalWidth;
  const sourceHeight = src.height || src.naturalHeight;
  const size = outputSize(sourceWidth, sourceHeight, width, height, lockAspect);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // JPEG has no alpha — paint white so transparency doesn't turn black.
  if (targetValue === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.drawImage(src, 0, 0, size.width, size.height);

  const mime = formatByValue(targetValue).mime;
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not encode this format"))), mime, qualityValue(quality)),
  );
  throwIfAborted(signal);
  // Some browsers silently return PNG when asked for an unsupported encoder.
  // Never put those bytes behind a misleading .webp/.avif extension.
  if (blob.type && blob.type !== mime) throw new Error("This browser needs the studio engine for that format");
  return { blob, name: outName(file, targetValue) };
}

// Build ffmpeg args for a given target. Sensible high-quality defaults.
function crfFor(quality) {
  if (quality === "small") return "30";
  if (quality === "best") return "18";
  return "23";
}

function audioArgs(settings) {
  const args = [];
  if (settings.bitrate) args.push("-b:a", `${settings.bitrate}k`);
  if (settings.sampleRate && settings.sampleRate !== "auto") args.push("-ar", String(settings.sampleRate));
  if (settings.mono) args.push("-ac", "1");
  return args;
}

function videoFilters(settings) {
  const filters = [];
  if (settings.resolution && settings.resolution !== "original") filters.push(`scale=-2:${settings.resolution}`);
  else if (settings.width || settings.height) {
    const width = settings.width || -2;
    const height = settings.height || -2;
    filters.push(`scale=${width}:${height}`);
  }
  if (settings.fps && settings.fps !== "original") filters.push(`fps=${settings.fps}`);
  return filters;
}

function ffmpegArgs(inName, outNm, targetValue, settings = {}) {
  const a = ["-i", inName];
  const filters = videoFilters(settings);
  const vf = filters.length ? ["-vf", filters.join(",")] : [];
  const noAudio = settings.mute ? ["-an"] : [];
  const crf = crfFor(settings.quality);
  switch (targetValue) {
    case "mp4":
      return [...a, ...vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, ...noAudio, ...(settings.mute ? [] : ["-c:a", "aac", "-b:a", "192k"]), "-movflags", "+faststart", outNm];
    case "webm":
      return [...a, ...vf, "-c:v", "libvpx-vp9", "-crf", settings.quality === "best" ? "24" : settings.quality === "small" ? "38" : "31", "-b:v", "0", ...noAudio, ...(settings.mute ? [] : ["-c:a", "libopus"]), outNm];
    case "mkv":
    case "mov":
      return [...a, ...vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, ...noAudio, ...(settings.mute ? [] : ["-c:a", "aac", "-b:a", "192k"]), outNm];
    case "avi":
      return [...a, ...vf, "-c:v", "mpeg4", "-q:v", settings.quality === "best" ? "2" : settings.quality === "small" ? "7" : "4", ...noAudio, ...(settings.mute ? [] : ["-c:a", "libmp3lame", "-b:a", "192k"]), outNm];
    case "3gp":
    case "3g2":
      return [...a, ...vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, ...noAudio, ...(settings.mute ? [] : ["-c:a", "aac", "-b:a", "128k"]), "-movflags", "+faststart", outNm];
    case "flv":
      return [...a, ...vf, "-c:v", "flv", "-q:v", settings.quality === "best" ? "3" : settings.quality === "small" ? "9" : "6", ...noAudio, ...(settings.mute ? [] : ["-c:a", "libmp3lame", "-b:a", "128k"]), outNm];
    case "m4v":
      return [...a, ...vf, "-an", "-c:v", "mpeg4", "-q:v", settings.quality === "best" ? "2" : settings.quality === "small" ? "7" : "4", outNm];
    case "mpeg":
    case "mpg":
      return [...a, ...vf, "-c:v", "mpeg2video", "-q:v", settings.quality === "best" ? "2" : settings.quality === "small" ? "7" : "4", ...noAudio, ...(settings.mute ? [] : ["-c:a", "mp2", "-b:a", "192k"]), outNm];
    case "ogv":
      return [...a, ...vf, "-c:v", "libtheora", "-q:v", settings.quality === "best" ? "9" : settings.quality === "small" ? "4" : "7", ...noAudio, ...(settings.mute ? [] : ["-c:a", "libvorbis", "-q:a", "5"]), outNm];
    case "ts":
      return [...a, ...vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, ...noAudio, ...(settings.mute ? [] : ["-c:a", "aac", "-b:a", "192k"]), "-f", "mpegts", outNm];
    case "m2ts":
      return [...a, ...vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, ...noAudio, ...(settings.mute ? [] : ["-c:a", "aac", "-b:a", "192k"]), "-mpegts_m2ts_mode", "1", "-f", "mpegts", outNm];
    case "vob":
      return [...a, ...vf, "-c:v", "mpeg2video", "-q:v", settings.quality === "best" ? "2" : settings.quality === "small" ? "7" : "4", ...noAudio, ...(settings.mute ? [] : ["-c:a", "ac3", "-b:a", "192k"]), "-f", "vob", outNm];
    case "wmv":
      return [...a, ...vf, "-c:v", "wmv2", "-q:v", settings.quality === "best" ? "2" : settings.quality === "small" ? "7" : "4", ...noAudio, ...(settings.mute ? [] : ["-c:a", "wmav2", "-b:a", "192k"]), outNm];
    case "gif":
      return [...a, "-vf", `fps=${settings.fps || 12},scale=${settings.width || 480}:-1:flags=lanczos`, "-loop", settings.loop === false ? "-1" : "0", outNm];
    case "mp3":
      return [...a, "-vn", "-c:a", "libmp3lame", ...audioArgs(settings), outNm];
    case "wav":
      return [...a, "-vn", "-c:a", "pcm_s16le", ...(settings.sampleRate && settings.sampleRate !== "auto" ? ["-ar", String(settings.sampleRate)] : []), ...(settings.mono ? ["-ac", "1"] : []), outNm];
    case "m4a":
    case "m4b":
    case "aac":
      return [...a, "-vn", "-c:a", "aac", ...audioArgs(settings), outNm];
    case "ogg":
    case "oga":
      return [...a, "-vn", "-c:a", "libvorbis", ...audioArgs(settings), outNm];
    case "opus":
      return [...a, "-vn", "-c:a", "libopus", ...audioArgs(settings), outNm];
    case "weba":
      return [...a, "-vn", "-c:a", "libopus", ...audioArgs(settings), "-f", "webm", outNm];
    case "flac":
      return [...a, "-vn", "-c:a", "flac", ...(settings.sampleRate && settings.sampleRate !== "auto" ? ["-ar", String(settings.sampleRate)] : []), ...(settings.mono ? ["-ac", "1"] : []), outNm];
    case "ac3":
      return [...a, "-vn", "-c:a", "ac3", ...audioArgs(settings), outNm];
    case "aiff":
    case "aif":
    case "aifc":
      return [...a, "-vn", "-c:a", "pcm_s16be", ...(settings.sampleRate && settings.sampleRate !== "auto" ? ["-ar", String(settings.sampleRate)] : []), ...(settings.mono ? ["-ac", "1"] : []), "-f", "aiff", outNm];
    case "au":
      return [...a, "-vn", "-c:a", "pcm_s16be", ...(settings.sampleRate && settings.sampleRate !== "auto" ? ["-ar", String(settings.sampleRate)] : []), ...(settings.mono ? ["-ac", "1"] : []), outNm];
    case "caf":
      return [...a, "-vn", "-c:a", "pcm_s16le", ...(settings.sampleRate && settings.sampleRate !== "auto" ? ["-ar", String(settings.sampleRate)] : []), ...(settings.mono ? ["-ac", "1"] : []), outNm];
    case "wma":
      return [...a, "-vn", "-c:a", "wmav2", ...audioArgs(settings), outNm];
    // exotic image formats through ffmpeg
    default:
      return [...a, ...vf, outNm];
  }
}

async function ffmpegConvert(file, targetValue, { onStatus, onProgress, signal, ...settings } = {}) {
  throwIfAborted(signal);
  const cancel = () => cancelFFmpeg();
  signal?.addEventListener("abort", cancel, { once: true });
  let ffmpeg = null;
  const inName = `in.${extOf(file) || "bin"}`;
  const outNm = outName(file, targetValue);
  try {
    ffmpeg = await loadFFmpeg(onStatus);
    throwIfAborted(signal);
    onFFmpegProgress((p) => onProgress?.(p));
    await ffmpeg.writeFile(inName, await fileToUint8(file));
    throwIfAborted(signal);
    onStatus?.("Converting…");
    await ffmpeg.exec(ffmpegArgs(inName, outNm, targetValue, settings));
    throwIfAborted(signal);
    const data = await ffmpeg.readFile(outNm);
    const mime = formatByValue(targetValue)?.mime || "application/octet-stream";
    const blob = new Blob([data.buffer], { type: mime });
    onStatus?.("");
    return { blob, name: outNm };
  } finally {
    signal?.removeEventListener("abort", cancel);
    await ffmpeg?.deleteFile(inName).catch(() => {});
    await ffmpeg?.deleteFile(outNm).catch(() => {});
  }
}

const HARDWARE_VIDEO_OUTPUTS = new Set(["mp4", "mov", "webm", "mkv", "ts"]);

async function hardwareVideoConvert(file, targetValue, { onStatus, onProgress, signal, ...settings } = {}) {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    throw new Error("Hardware codecs are unavailable");
  }
  const media = await import("mediabunny");
  const outputFormats = {
    mp4: () => new media.Mp4OutputFormat({ fastStart: false }),
    mov: () => new media.MovOutputFormat({ fastStart: false }),
    webm: () => new media.WebMOutputFormat(),
    mkv: () => new media.MkvOutputFormat(),
    ts: () => new media.MpegTsOutputFormat(),
  };
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  const target = new media.BufferTarget();
  const output = new media.Output({ format: outputFormats[targetValue](), target });
  const webmFamily = targetValue === "webm" || targetValue === "mkv";
  const quality = settings.quality === "best"
    ? media.QUALITY_HIGH
    : settings.quality === "small"
      ? media.QUALITY_LOW
      : media.QUALITY_MEDIUM;
  let conversion = null;
  const cancel = () => void conversion?.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    throwIfAborted(signal);
    onStatus?.("Converting with hardware acceleration…");
    conversion = await media.Conversion.init({
      input,
      output,
      tracks: "primary",
      video: {
        codec: webmFamily ? "vp9" : "avc",
        bitrate: quality,
        ...(settings.resolution && settings.resolution !== "original" ? { height: Number(settings.resolution) } : {}),
        ...(settings.fps && settings.fps !== "original" ? { frameRate: Number(settings.fps) } : {}),
        hardwareAcceleration: "prefer-hardware",
        keyFrameInterval: 5,
      },
      audio: settings.mute
        ? { discard: true }
        : { codec: webmFamily ? "opus" : "aac", bitrate: 192_000 },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error("This source codec needs the compatibility engine");
    conversion.onProgress = (progress) => onProgress?.(Math.max(0, Math.min(0.99, progress)));
    await conversion.execute();
    throwIfAborted(signal);
    if (!target.buffer) throw new Error("The hardware converter produced no output");
    onProgress?.(1);
    onStatus?.("");
    return {
      blob: new Blob([target.buffer], { type: formatByValue(targetValue)?.mime || output.format.mimeType }),
      name: outName(file, targetValue),
      hardwareAccelerated: true,
    };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    input.dispose();
  }
}

// Decide the route and convert. Returns { blob, name }.
export async function convertFile(file, targetValue, opts = {}) {
  throwIfAborted(opts.signal);
  const source = detectFormat(file);
  const sourceExt = source?.value || extOf(file);

  if (isTextConversion(file, targetValue)) return convertTextFile(file, targetValue, opts);

  if (targetValue === "pdf" && categoryOf(file) === "image") {
    try {
      return await imageToPdf(file, opts);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      opts.onStatus?.("Preparing image for PDF…");
      const raster = await ffmpegConvert(file, "png", opts);
      const proxy = new File([raster.blob], `${file.name.replace(/\.[^.]+$/, "")}.png`, { type: "image/png" });
      return imageToPdf(proxy, opts);
    }
  }

  if (normalizeFormatValue(sourceValueOf(file)) === normalizeFormatValue(targetValue) && !["image", "audio", "video"].includes(source?.category)) {
    opts.onProgress?.(1);
    return { blob: file, name: file.name };
  }

  // Unknown catalog formats are still valid for same-format conversion: it is
  // an intentional client-side pass-through, not a disabled or fake action.
  if (normalizeFormatValue(sourceValueOf(file)) === normalizeFormatValue(targetValue) && !formatByValue(targetValue)) {
    opts.onProgress?.(1);
    return { blob: file, name: file.name };
  }

  if (!formatByValue(targetValue)) throw new Error("This output format is coming soon");

  if (targetValue === "svg") {
    try {
      return await traceImageToSvg(file, opts);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // RAW/HEIC/TIFF variants are not consistently browser-decodable. Decode
      // them locally through ffmpeg first, then feed the raster into the same
      // vector tracer so the final output is still composed of SVG paths.
      opts.onStatus?.("Preparing image for tracing…");
      const raster = await ffmpegConvert(file, "png", opts);
      const proxy = new File([raster.blob], `${file.name.replace(/\.[^.]+$/, "")}.png`, { type: "image/png" });
      return traceImageToSvg(proxy, opts);
    }
  }

  // Canvas fast-path: raster→raster the browser can do natively.
  if (CANVAS_OUTPUTS.has(targetValue) && CANVAS_INPUTS.has(sourceExt)) {
    try {
      return await canvasConvert(file, targetValue, opts);
    } catch (error) {
      // A browser may decode an image but not encode the requested target
      // (AVIF is the common case). Fall through to ffmpeg instead of producing
      // mislabeled bytes.
      if (error?.name === "AbortError") throw error;
    }
  }

  // Browser-native codecs use the device's video hardware and are dramatically
  // faster than CPU-only FFmpeg WebAssembly. Unsupported source codecs still
  // fall back to the broad compatibility engine below.
  if (categoryOf(file) === "video" && HARDWARE_VIDEO_OUTPUTS.has(targetValue)) {
    try {
      return await hardwareVideoConvert(file, targetValue, opts);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      opts.onStatus?.("Using compatibility engine…");
    }
  }

  // Everything else → ffmpeg.
  return ffmpegConvert(file, targetValue, opts);
}

// Whether a conversion needs the heavy ffmpeg engine (drives UI messaging).
export function needsEngine(file, targetValue) {
  if (targetValue === "svg") return false;
  const sourceExt = detectFormat(file)?.value || extOf(file);
  return !(CANVAS_OUTPUTS.has(targetValue) && CANVAS_INPUTS.has(sourceExt));
}
