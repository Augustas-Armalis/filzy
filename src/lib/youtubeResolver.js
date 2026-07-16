import { EXTRACT_PROXY, normalizeYouTubeFormat } from "@/lib/extract";

function abortError() {
  return new DOMException("Extraction cancelled", "AbortError");
}

function resolveEndpoint(videoId) {
  const endpoint = new URL(EXTRACT_PROXY, window.location.origin);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/resolve`;
  endpoint.search = "";
  endpoint.searchParams.set("videoId", videoId);
  return endpoint.toString();
}

function normalizeWorkerFormat(format) {
  const mimeType = format?.mimeType || "application/octet-stream";
  const hasVideo = mimeType.startsWith("video/") || Boolean(format?.width || format?.height);
  const hasAudio = mimeType.startsWith("audio/") || Boolean(format?.audioQuality || format?.audioChannels || format?.audioSampleRate);
  return normalizeYouTubeFormat({
    ...format,
    mime_type: mimeType,
    approx_duration_ms: format?.approxDurationMs,
    average_bitrate: format?.averageBitrate,
    content_length: format?.contentLength,
    audio_channels: format?.audioChannels,
    audio_sample_rate: format?.audioSampleRate,
    has_video: hasVideo,
    has_audio: hasAudio,
  });
}

async function resolveThroughWorker(source, { signal, onPhase } = {}) {
  onPhase?.("Checking available formats…");
  let payload = {};
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(resolveEndpoint(source.videoId), { signal, headers: { accept: "application/json" } });
    payload = await response.json().catch(() => ({}));
    if (response.ok) break;
    const transient = [429, 502, 503].includes(response.status);
    if (!transient || attempt === 2) throw new Error(payload.error || `The extraction Worker returned ${response.status}.`);
    onPhase?.("Retrying source…");
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        reject(abortError());
      };
      const timeout = window.setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, 650 * (attempt + 1));
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  const formats = (payload.formats || [])
    .map((format) => normalizeWorkerFormat({ ...format, workerSessionId: payload.browserSessionId }))
    .filter((format) => format.itag && format.container && format.raw?.url && (format.hasVideo || format.hasAudio));
  if (!formats.length) throw new Error("No downloadable source formats were returned for this video.");
  return {
    id: `youtube:${source.videoId}`,
    provider: source,
    url: source.url,
    title: payload.title || "YouTube video",
    author: payload.author || "YouTube",
    durationSeconds: Number(payload.durationSeconds || 0),
    thumbnail: payload.thumbnail || source.thumbnail,
    formats,
    _context: { signal: null },
  };
}

export async function resolveSocialMedia(source, { signal, onPhase } = {}) {
  if (signal?.aborted) throw abortError();
  onPhase?.(`Reading ${source.label}…`);
  const endpoint = new URL(EXTRACT_PROXY, window.location.origin);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/resolve-social`;
  endpoint.search = "";
  endpoint.searchParams.set("url", source.url);
  const response = await fetch(endpoint, { signal, headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Could not read this ${source.label} post.`);
  const formats = (payload.formats || [])
    .map((format) => normalizeWorkerFormat({ ...format, workerSessionId: payload.browserSessionId }))
    .filter((format) => format.itag && format.raw?.url);
  if (!formats.length) throw new Error("This post did not expose a public media file.");
  return {
    id: `${source.id}:${source.url}`,
    provider: source,
    url: source.url,
    title: payload.title || `${source.label} video`,
    author: payload.author || source.label,
    durationSeconds: Number(payload.durationSeconds || 0),
    thumbnail: payload.thumbnail || "",
    formats,
    _context: { signal: null },
  };
}

export async function resolveYouTube(source, { signal, onPhase } = {}) {
  if (signal?.aborted) throw abortError();
  onPhase?.("Reading source…");
  try {
    return await resolveThroughWorker(source, { signal, onPhase });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw abortError();
    const message = String(error?.message || "Could not inspect this YouTube link.");
    if (/429|rate limit|browser.*busy|unable to create new browser/i.test(message)) {
      throw new Error("The extractor is busy for a moment. Wait a few seconds, then try the link again.");
    }
    if (/fetch|network|proxy|worker|failed/i.test(message)) {
      throw new Error("Could not reach Filzy’s extractor. Check your connection and try again.");
    }
    throw error;
  }
}
