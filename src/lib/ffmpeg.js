// Lazy, self-hosted ffmpeg.wasm loader shared by Converter and Compressor.
// Vite emits the single-thread core and WASM as versioned Filzy assets, so
// conversions do not depend on a third-party CDN or cross-origin isolation.
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import classWorkerURL from "@ffmpeg/ffmpeg/worker?url";

let ffmpegPromise = null;
let ffmpegInstance = null;
let progressCb = null;
let logLines = [];

// Subscribe to conversion progress (0..1). Replaces any previous subscriber.
export function onFFmpegProgress(cb) {
  progressCb = cb;
}

export function ffmpegFailureMessage(fallback = "Conversion failed") {
  const detail = [...logLines]
    .reverse()
    .find((line) => /error|failed|invalid|unknown|not found|unable|unsupported/i.test(line));
  return detail ? `${fallback}: ${detail}` : fallback;
}

// Returns a loaded FFmpeg instance (singleton). onStatus is called with short
// human phase strings while the ~30MB core downloads the first time.
export async function loadFFmpeg(onStatus) {
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    onStatus?.("Starting conversion…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");

    const ffmpeg = new FFmpeg();
    ffmpegInstance = ffmpeg;
    logLines = [];
    ffmpeg.on("progress", ({ progress }) => {
      if (progressCb && Number.isFinite(progress)) progressCb(Math.max(0, Math.min(1, progress)));
    });
    ffmpeg.on("log", ({ message }) => {
      if (!message) return;
      logLines.push(message);
      if (logLines.length > 100) logLines.shift();
    });

    await ffmpeg.load({
      coreURL,
      wasmURL,
      // Vite cannot reliably infer FFmpeg's package-relative worker after the
      // library is split into a lazy production chunk. Supplying the emitted
      // asset explicitly keeps both development and deployed conversions on
      // the same self-hosted worker.
      classWorkerURL,
    });
    onStatus?.("");
    return ffmpeg;
  })();

  try {
    return await ffmpegPromise;
  } catch (err) {
    ffmpegPromise = null; // allow a retry on failure
    ffmpegInstance = null;
    const message = typeof err === "string" ? err : err?.message;
    throw new Error(message || "The local conversion engine could not start");
  }
}

// Stop the active conversion and reset the singleton so the next conversion
// starts with a clean worker. terminate() is the only reliable way to cancel
// an ffmpeg.wasm exec while it is in progress.
export function cancelFFmpeg() {
  try {
    ffmpegInstance?.terminate();
  } finally {
    ffmpegInstance = null;
    ffmpegPromise = null;
    progressCb = null;
    logLines = [];
  }
}

// Read a File/Blob into the Uint8Array ffmpeg's FS expects.
export async function fileToUint8(file) {
  return new Uint8Array(await file.arrayBuffer());
}
