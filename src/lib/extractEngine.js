import { cancelFFmpeg, fileToUint8, loadFFmpeg, onFFmpegProgress } from "@/lib/ffmpeg";
import { convertFile } from "@/lib/convert";
import { audioChoices, EXTRACT_PROXY, findFormat } from "@/lib/extract";

function abortError() {
  return new DOMException("Extraction cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function safeBaseName(value) {
  return String(value || "media")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "media";
}

function mimeForTarget(target) {
  if (target === "mp4") return "video/mp4";
  if (target === "webm") return "video/webm";
  if (target === "mp3") return "audio/mpeg";
  if (target === "m4a") return "audio/mp4";
  return "application/octet-stream";
}

const DIRECT_RANGE_SIZE = 16 * 1024 * 1024;
const BROWSER_RANGE_SIZE = 1024 * 1024;
const DOWNLOAD_RETRIES = 3;
const tempEntries = new Set();

async function createSpool(mimeType = "application/octet-stream") {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) throw new Error("OPFS unavailable");
    const entryName = `filzy-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    const handle = await root.getFileHandle(entryName, { create: true });
    const writable = await handle.createWritable();
    tempEntries.add(entryName);
    let closed = false;
    return {
      async write(data, position) {
        await writable.write({ type: "write", position, data });
      },
      async finish(name) {
        if (!closed) {
          await writable.close();
          closed = true;
        }
        const file = await handle.getFile();
        // File objects are immutable snapshots, so removing the temporary OPFS
        // entry does not invalidate the returned result.
        await root.removeEntry(entryName).catch(() => {});
        tempEntries.delete(entryName);
        return new File([file], name, { type: mimeType });
      },
      async abort() {
        if (!closed) {
          await writable.abort().catch(() => {});
          closed = true;
        }
        await root.removeEntry(entryName).catch(() => {});
        tempEntries.delete(entryName);
      },
      diskBacked: true,
    };
  } catch {
    const chunks = [];
    return {
      async write(data) {
        chunks.push(data.slice ? data.slice() : new Uint8Array(data));
      },
      async finish(name) {
        return new File(chunks, name, { type: mimeType });
      },
      async abort() {
        chunks.length = 0;
      },
      diskBacked: false,
    };
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!tempEntries.size) return;
    void navigator.storage?.getDirectory?.().then((root) => Promise.all(
      [...tempEntries].map((name) => root.removeEntry(name).catch(() => {})),
    ));
  });
}

function contentRangeTotal(response) {
  return Number((response.headers.get("content-range") || "").match(/\/(\d+)$/)?.[1] || 0);
}

async function waitRetry(attempt, signal) {
  throwIfAborted(signal);
  await new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 450 * (attempt + 1));
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function downloadRanged(endpointFor, {
  signal,
  onProgress,
  totalBytes = 0,
  mimeType,
  name = "media",
  rangeSize = DIRECT_RANGE_SIZE,
} = {}) {
  const spool = await createSpool(mimeType);
  let offset = 0;
  let total = Number(totalBytes || 0);
  let completed = false;
  try {
    while (!total || offset < total) {
      throwIfAborted(signal);
      const requestedEnd = total
        ? Math.min(total - 1, offset + rangeSize - 1)
        : offset + rangeSize - 1;
      let requestCompleted = false;
      for (let attempt = 0; attempt < DOWNLOAD_RETRIES && !requestCompleted; attempt += 1) {
        try {
          const response = await fetch(endpointFor(offset, requestedEnd, total), {
            signal,
            headers: { range: `bytes=${offset}-${requestedEnd}` },
          });
          if (response.status === 416) {
            completed = true;
            requestCompleted = true;
            break;
          }
          if (!response.ok || !response.body) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `The source returned ${response.status}.`);
          }
          total = contentRangeTotal(response)
            || total
            || Number(response.headers.get("content-length") || 0);
          const reader = response.body.getReader();
          let readThisRequest = 0;
          while (true) {
            throwIfAborted(signal);
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.byteLength) continue;
            await spool.write(value, offset);
            offset += value.byteLength;
            readThisRequest += value.byteLength;
            onProgress?.(total ? Math.min(0.995, offset / total) : 0);
          }
          // A 200 response ignored Range and delivered the complete resource.
          if (response.status === 200 || (!total && readThisRequest < rangeSize)) completed = true;
          requestCompleted = true;
        } catch (error) {
          if (signal?.aborted || error?.name === "AbortError") throw abortError();
          if (attempt === DOWNLOAD_RETRIES - 1) throw error;
          await waitRetry(attempt, signal);
          // `offset` advances only after a successful disk write, so the next
          // range resumes exactly where the interrupted response stopped.
        }
      }
      if (completed) break;
    }
    onProgress?.(1);
    return await spool.finish(name);
  } catch (error) {
    await spool.abort();
    throw error;
  }
}

async function collectStream(stream, totalBytes, { signal, onProgress } = {}) {
  throwIfAborted(signal);
  const reader = stream.getReader();
  const chunks = [];
  let received = 0;
  const cancel = () => reader.cancel("Extraction cancelled").catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (totalBytes) onProgress?.(Math.min(0.99, received / totalBytes));
    }
    onProgress?.(1);
    return chunks;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function downloadBrowserSession(format, options = {}) {
  const target = format.raw?.url;
  const sessionId = format.raw?.workerSessionId;
  if (!target || !sessionId) throw new Error("That extraction session has expired. Inspect the link again.");
  return downloadRanged((start, end, total) => {
    const endpoint = new URL(format.raw?.workerProxy || EXTRACT_PROXY, window.location.origin);
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/browser-media`;
    endpoint.search = "";
    endpoint.searchParams.set("sessionId", sessionId);
    endpoint.searchParams.set("url", target);
    if (total && end >= total - 1) endpoint.searchParams.set("close", "1");
    return endpoint;
  }, {
    ...options,
    totalBytes: format.bytes,
    mimeType: format.mimeType,
    name: `source.${format.container || "bin"}`,
    rangeSize: BROWSER_RANGE_SIZE,
  });
}

async function downloadFormat(media, format, options = {}) {
  if (!format) throw new Error("That source format is no longer available.");
  throwIfAborted(options.signal);
  if (media._context) media._context.signal = options.signal || null;

  let stream;
  let totalBytes = format.bytes;
  if (media._info?.download) {
    stream = await media._info.download({ itag: format.itag });
  } else if (format.raw?.workerSessionId) {
    return downloadBrowserSession(format, options);
  } else {
    const target = format.raw?.url;
    if (!target) throw new Error("That source stream has expired. Inspect the link again.");
    const endpoint = new URL(format.raw?.workerProxy || EXTRACT_PROXY, window.location.origin);
    endpoint.searchParams.set("url", target);
    return downloadRanged(() => endpoint, {
      ...options,
      totalBytes,
      mimeType: format.mimeType,
      name: `source.${format.container || "bin"}`,
    });
  }

  const chunks = await collectStream(stream, totalBytes, options);
  throwIfAborted(options.signal);
  return new Blob(chunks, { type: format.mimeType });
}

async function muxStreamsHardware(videoBlob, audioBlob, videoFormat, audioFormat, target, {
  signal,
  onProgress,
  onPhase,
} = {}) {
  if (typeof VideoDecoder === "undefined" && typeof AudioDecoder === "undefined") {
    throw new Error("Browser media pipeline unavailable");
  }
  const media = await import("mediabunny");
  const videoInput = new media.Input({ source: new media.BlobSource(videoBlob), formats: media.ALL_FORMATS });
  const audioInput = new media.Input({ source: new media.BlobSource(audioBlob), formats: media.ALL_FORMATS });
  const mimeType = mimeForTarget(target);
  const spool = await createSpool(mimeType);
  let outputTarget;
  if (spool.diskBacked) {
    const writable = new WritableStream({
      write: (chunk) => spool.write(chunk.data, chunk.position),
    });
    outputTarget = new media.StreamTarget(writable, { chunked: true, chunkSize: 16 * 1024 * 1024 });
  } else {
    await spool.abort();
    outputTarget = new media.BufferTarget();
  }
  const outputFormat = target === "webm"
    ? new media.WebMOutputFormat()
    : new media.Mp4OutputFormat({ fastStart: false });
  const output = new media.Output({ format: outputFormat, target: outputTarget });
  let videoConversion;
  let audioConversion;
  const cancel = () => {
    void videoConversion?.cancel();
    void audioConversion?.cancel();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    onPhase?.("Combining original streams…");
    videoConversion = await media.Conversion.init({
      input: videoInput,
      output,
      video: {},
      audio: { discard: true },
      tracks: "primary",
      composable: true,
      showWarnings: false,
    });
    audioConversion = await media.Conversion.init({
      input: audioInput,
      output,
      video: { discard: true },
      audio: {},
      tracks: "primary",
      composable: true,
      showWarnings: false,
    });
    if (!videoConversion.utilizedTracks.length || !audioConversion.utilizedTracks.length) {
      throw new Error("The browser could not combine these source codecs");
    }
    let videoProgress = 0;
    let audioProgress = 0;
    const update = () => onProgress?.((videoProgress + audioProgress) / 2);
    videoConversion.onProgress = (value) => { videoProgress = value; update(); };
    audioConversion.onProgress = (value) => { audioProgress = value; update(); };
    await output.start();
    await Promise.all([videoConversion.execute(), audioConversion.execute()]);
    throwIfAborted(signal);
    await output.finalize();
    if (outputTarget instanceof media.BufferTarget) {
      if (!outputTarget.buffer) throw new Error("The browser muxer produced no output");
      return new Blob([outputTarget.buffer], { type: mimeType });
    }
    return await spool.finish(`combined.${target}`);
  } catch (error) {
    await spool.abort();
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    videoInput.dispose();
    audioInput.dispose();
  }
}

async function muxStreams(videoBlob, audioBlob, videoFormat, audioFormat, target, { signal, onProgress, onPhase } = {}) {
  throwIfAborted(signal);
  try {
    return await muxStreamsHardware(videoBlob, audioBlob, videoFormat, audioFormat, target, {
      signal,
      onProgress,
      onPhase,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    onPhase?.("Using compatibility muxer…");
  }
  const cancel = () => cancelFFmpeg();
  signal?.addEventListener("abort", cancel, { once: true });
  let ffmpeg;
  const token = Math.random().toString(36).slice(2, 9);
  const videoName = `video-${token}.${videoFormat.container || "mp4"}`;
  const audioName = `audio-${token}.${audioFormat.container === "mp4" ? "m4a" : audioFormat.container || "webm"}`;
  const outputName = `output-${token}.${target}`;
  try {
    onPhase?.("Preparing local muxer…");
    ffmpeg = await loadFFmpeg(onPhase);
    throwIfAborted(signal);
    await ffmpeg.writeFile(videoName, await fileToUint8(videoBlob));
    await ffmpeg.writeFile(audioName, await fileToUint8(audioBlob));
    throwIfAborted(signal);
    onFFmpegProgress((value) => onProgress?.(value));
    onPhase?.("Combining original streams…");
    const args = ["-i", videoName, "-i", audioName, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest"];
    if (target === "mp4") args.push("-movflags", "+faststart");
    args.push(outputName);
    await ffmpeg.exec(args);
    throwIfAborted(signal);
    const output = await ffmpeg.readFile(outputName);
    return new Blob([output.buffer], { type: mimeForTarget(target) });
  } finally {
    signal?.removeEventListener("abort", cancel);
    await ffmpeg?.deleteFile(videoName).catch(() => {});
    await ffmpeg?.deleteFile(audioName).catch(() => {});
    await ffmpeg?.deleteFile(outputName).catch(() => {});
  }
}

function compatibleAudio(media, settings) {
  const requested = findFormat(media, settings.audioId);
  if (requested) return requested;
  const fallback = audioChoices(media, settings.target)[0];
  return findFormat(media, fallback?.value);
}

async function extractVideo(media, settings, { signal, onProgress, onPhase } = {}) {
  const video = findFormat(media, settings.formatId);
  if (!video?.hasVideo) throw new Error("Choose one of the available video qualities.");

  if (video.hasAudio || !settings.includeAudio) {
    onPhase?.(video.hasAudio ? "Downloading original file…" : "Downloading original video…");
    const blob = await downloadFormat(media, video, { signal, onProgress });
    return { blob, name: `${safeBaseName(media.title)}.${settings.target}` };
  }

  const audio = compatibleAudio(media, settings);
  if (!audio) throw new Error("No compatible source audio is available for this container.");
  onPhase?.("Downloading original streams…");
  let videoProgress = 0;
  let audioProgress = 0;
  const total = Math.max(1, video.bytes + audio.bytes);
  const update = () => onProgress?.(((videoProgress * video.bytes) + (audioProgress * audio.bytes)) / total * 0.72);
  const [videoBlob, audioBlob] = await Promise.all([
    downloadFormat(media, video, { signal, onProgress: (value) => { videoProgress = value; update(); } }),
    downloadFormat(media, audio, { signal, onProgress: (value) => { audioProgress = value; update(); } }),
  ]);
  const blob = await muxStreams(videoBlob, audioBlob, video, audio, settings.target, {
    signal,
    onPhase,
    onProgress: (value) => onProgress?.(0.72 + value * 0.28),
  });
  onProgress?.(1);
  return { blob, name: `${safeBaseName(media.title)}.${settings.target}` };
}

async function extractAudio(media, settings, { signal, onProgress, onPhase } = {}) {
  const audio = findFormat(media, settings.formatId);
  if (!audio?.hasAudio) throw new Error("Choose one of the available audio tracks.");
  onPhase?.("Downloading original audio…");
  const sourceBlob = await downloadFormat(media, audio, {
    signal,
    onProgress: (value) => onProgress?.(settings.target === "m4a" ? value : value * 0.72),
  });
  if (settings.target === "m4a") {
    onProgress?.(1);
    return { blob: new Blob([sourceBlob], { type: "audio/mp4" }), name: `${safeBaseName(media.title)}.m4a` };
  }

  const sourceExtension = audio.container === "mp4" ? "m4a" : audio.container || "webm";
  const source = new File([sourceBlob], `${safeBaseName(media.title)}.${sourceExtension}`, { type: audio.mimeType });
  const result = await convertFile(source, "mp3", {
    signal,
    bitrate: Number(settings.bitrate || 320),
    mono: settings.channels === "mono",
    onStatus: onPhase,
    onProgress: (value) => onProgress?.(0.72 + value * 0.28),
  });
  onProgress?.(1);
  return { ...result, name: `${safeBaseName(media.title)}.mp3` };
}

export async function extractMedia(media, settings, options = {}) {
  throwIfAborted(options.signal);
  try {
    if (["mp4", "webm"].includes(settings.target)) return await extractVideo(media, settings, options);
    if (["mp3", "m4a"].includes(settings.target)) return await extractAudio(media, settings, options);
    throw new Error("That output format is not available for this source.");
  } finally {
    if (media?._context) media._context.signal = null;
  }
}
