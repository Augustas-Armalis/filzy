import { cancelFFmpeg, fileToUint8, loadFFmpeg, onFFmpegProgress } from "@/lib/ffmpeg";
import { convertFile } from "@/lib/convert";
import { audioChoices, findFormat } from "@/lib/extract";

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

async function downloadFormat(media, format, options = {}) {
  if (!format) throw new Error("That source format is no longer available.");
  throwIfAborted(options.signal);
  media._context.signal = options.signal || null;
  const stream = await media._info.download({ itag: format.itag });
  const chunks = await collectStream(stream, format.bytes, options);
  throwIfAborted(options.signal);
  return new Blob(chunks, { type: format.mimeType });
}

async function muxStreams(videoBlob, audioBlob, videoFormat, audioFormat, target, { signal, onProgress, onPhase } = {}) {
  throwIfAborted(signal);
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
