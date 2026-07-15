// Lazy ffmpeg.wasm loader, shared by the Converter and Compressor.
//
// Loaded on demand from a CDN (kept out of the app bundle) so the base app
// stays tiny and only users who actually convert/compress audio or video pay
// the download. We use the SINGLE-THREADED core so it works without
// cross-origin isolation (COOP/COEP) — which GitHub Pages can't set — meaning
// it runs for everyone, free, no backend.

const FF_VERSION = "0.12.15";
const UTIL_VERSION = "0.12.2";
const CORE_VERSION = "0.12.10"; // single-thread umd core
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegPromise = null;
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
    onStatus?.("Loading engine…");
    const { FFmpeg } = await import(/* @vite-ignore */ `https://esm.sh/@ffmpeg/ffmpeg@${FF_VERSION}`);
    const { toBlobURL } = await import(/* @vite-ignore */ `https://esm.sh/@ffmpeg/util@${UTIL_VERSION}`);

    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (progressCb && Number.isFinite(progress)) progressCb(Math.max(0, Math.min(1, progress)));
    });

    onStatus?.("Downloading engine…");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    onStatus?.("");
    return ffmpeg;
  })();

  try {
    return await ffmpegPromise;
  } catch (err) {
    ffmpegPromise = null; // allow a retry on failure
    throw err;
  }
}

// Read a File/Blob into the Uint8Array ffmpeg's FS expects.
export async function fileToUint8(file) {
  return new Uint8Array(await file.arrayBuffer());
}
