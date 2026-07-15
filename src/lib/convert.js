import { formatByValue, detectFormat, extOf, CANVAS_OUTPUTS, CANVAS_INPUTS } from "@/lib/formats";
import { loadFFmpeg, onFFmpegProgress, fileToUint8 } from "@/lib/ffmpeg";

/*
  The conversion engine. Two routes:

  1) CANVAS (instant, zero-dependency) — common raster images decoded by the
     browser and re-encoded to png/jpg/webp/avif. SVG output wraps the raster
     losslessly in an <svg><image> so a valid .svg is produced.

  2) FFMPEG (lazy CDN wasm) — everything else: all audio, all video, exotic
     image formats (gif/bmp/tiff/ico), and video→gif / video→audio.

  Every path resolves to { blob, name } so the UI can preview + download.
*/

function outName(file, targetValue) {
  const base = file.name.replace(/\.[^.]+$/, "") || "file";
  const ext = targetValue === "jpg" ? "jpg" : targetValue;
  return `${base}.${ext}`;
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

async function canvasConvert(file, targetValue, { quality = 0.92 } = {}) {
  const src = await decodeImage(file);
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // JPEG has no alpha — paint white so transparency doesn't turn black.
  if (targetValue === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(src, 0, 0, w, h);

  const mime = formatByValue(targetValue).mime;
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), mime, quality),
  );
  return { blob, name: outName(file, targetValue) };
}

async function toSvg(file) {
  // Wrap the source raster losslessly inside an SVG so the output is a real,
  // renderable .svg. (True vector tracing is a later, heavier add-on.)
  const src = await decodeImage(file);
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const dataUrl = await new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(src, 0, 0);
    resolve(c.toDataURL("image/png"));
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="${dataUrl}"/></svg>`;
  return { blob: new Blob([svg], { type: "image/svg+xml" }), name: outName(file, "svg") };
}

// Build ffmpeg args for a given target. Sensible high-quality defaults.
function ffmpegArgs(inName, outNm, targetValue) {
  const a = ["-i", inName];
  switch (targetValue) {
    case "mp4":
      return [...a, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outNm];
    case "webm":
      return [...a, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", outNm];
    case "mkv":
    case "mov":
    case "avi":
      return [...a, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "192k", outNm];
    case "gif":
      return [...a, "-vf", "fps=12,scale=480:-1:flags=lanczos", "-loop", "0", outNm];
    case "mp3":
      return [...a, "-vn", "-c:a", "libmp3lame", "-q:a", "2", outNm];
    case "wav":
      return [...a, "-vn", "-c:a", "pcm_s16le", outNm];
    case "m4a":
    case "aac":
      return [...a, "-vn", "-c:a", "aac", "-b:a", "256k", outNm];
    case "ogg":
      return [...a, "-vn", "-c:a", "libvorbis", "-q:a", "6", outNm];
    case "opus":
      return [...a, "-vn", "-c:a", "libopus", "-b:a", "160k", outNm];
    case "flac":
      return [...a, "-vn", "-c:a", "flac", outNm];
    // exotic image formats through ffmpeg
    default:
      return [...a, outNm];
  }
}

async function ffmpegConvert(file, targetValue, { onStatus, onProgress } = {}) {
  const ffmpeg = await loadFFmpeg(onStatus);
  onFFmpegProgress((p) => onProgress?.(p));

  const inName = `in.${extOf(file) || "bin"}`;
  const outNm = outName(file, targetValue);
  await ffmpeg.writeFile(inName, await fileToUint8(file));
  onStatus?.("Converting…");
  await ffmpeg.exec(ffmpegArgs(inName, outNm, targetValue));
  const data = await ffmpeg.readFile(outNm);
  await ffmpeg.deleteFile(inName).catch(() => {});
  await ffmpeg.deleteFile(outNm).catch(() => {});

  const mime = formatByValue(targetValue)?.mime || "application/octet-stream";
  const blob = new Blob([data.buffer], { type: mime });
  onStatus?.("");
  return { blob, name: outNm };
}

// Decide the route and convert. Returns { blob, name }.
export async function convertFile(file, targetValue, opts = {}) {
  const source = detectFormat(file);
  const sourceExt = source?.value || extOf(file);

  if (targetValue === "svg") return toSvg(file);

  // Canvas fast-path: raster→raster the browser can do natively.
  if (CANVAS_OUTPUTS.has(targetValue) && CANVAS_INPUTS.has(sourceExt)) {
    return canvasConvert(file, targetValue, opts);
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
