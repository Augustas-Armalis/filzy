// Lazy, self-hosted ffmpeg.wasm loader shared by Converter and Compressor.
// Vite emits the single-thread core and WASM as versioned Filzy assets, so
// conversions do not depend on a third-party CDN or cross-origin isolation.
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

let ffmpegPromise = null;
let ffmpegInstance = null;
let progressCb = null;

// Subscribe to conversion progress (0..1). Replaces any previous subscriber.
export function onFFmpegProgress(cb) {
  progressCb = cb;
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
    ffmpeg.on("progress", ({ progress }) => {
      if (progressCb && Number.isFinite(progress)) progressCb(Math.max(0, Math.min(1, progress)));
    });

    await ffmpeg.load({
      coreURL,
      wasmURL,
    });
    onStatus?.("");
    return ffmpeg;
  })();

  try {
    return await ffmpegPromise;
  } catch (err) {
    ffmpegPromise = null; // allow a retry on failure
    ffmpegInstance = null;
    throw err;
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
  }
}

// Read a File/Blob into the Uint8Array ffmpeg's FS expects.
export async function fileToUint8(file) {
  return new Uint8Array(await file.arrayBuffer());
}
