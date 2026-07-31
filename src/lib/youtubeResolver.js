import { EXTRACT_FALLBACK_PROXY, EXTRACT_PROXY, normalizeYouTubeFormat } from "@/lib/extract";

let localYouTubeRuntimePromise = null;
const WAA_REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

function abortError() {
  return new DOMException("Extraction cancelled", "AbortError");
}

function workerProxies() {
  return [...new Set([EXTRACT_PROXY, EXTRACT_FALLBACK_PROXY])];
}

function resolveEndpoint(videoId, proxy = EXTRACT_PROXY) {
  const endpoint = new URL(proxy, window.location.origin);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/resolve`;
  endpoint.search = "";
  endpoint.searchParams.set("videoId", videoId);
  return endpoint.toString();
}

function youtubeProxyFetch(input, init = {}) {
  const target = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const endpoint = new URL(EXTRACT_PROXY, window.location.origin);
  endpoint.searchParams.set("url", target);
  const inputHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(init.headers || inputHeaders || undefined);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("user-agent");
  return fetch(endpoint, {
    method: init.method || (input instanceof Request ? input.method : "GET"),
    headers,
    body: init.body,
    redirect: "follow",
    signal: init.signal,
  });
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

async function createLocalYouTubeRuntime() {
  const [youtubeModule, botguardModule, utilsModule, webPoModule] = await Promise.all([
    import("youtubei.js"),
    import("bgutils-js/botguard"),
    import("bgutils-js/utils"),
    import("bgutils-js/webpo"),
  ]);
  const Innertube = youtubeModule.default;
  youtubeModule.Platform.shim.eval = async (data) => new Function(data.output)();
  const innertube = await Innertube.create({
    enable_session_cache: false,
    fetch: youtubeProxyFetch,
  });
  const challenge = await botguardModule.getChallenge({
    fetchFunction: youtubeProxyFetch,
    requestKey: WAA_REQUEST_KEY,
  });
  const interpreterJavaScript = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if (!interpreterJavaScript) throw new Error("YouTube did not return its browser verifier");
  // The verifier is YouTube's own BotGuard program. Running it in the user's
  // browser produces the same proof-of-origin token as normal playback.
  new Function(interpreterJavaScript)();

  const botGuardClient = await botguardModule.BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });
  const webPoSignalOutput = [];
  const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });
  const integrityResponse = await youtubeProxyFetch(utilsModule.buildURL("GenerateIT", false), {
    method: "POST",
    headers: utilsModule.getHeaders(),
    body: JSON.stringify([WAA_REQUEST_KEY, botguardResponse]),
  });
  if (!integrityResponse.ok) throw new Error("YouTube rejected the browser verification");
  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await integrityResponse.json();
  const minter = await webPoModule.WebPoMinter.create({
    integrityToken,
    estimatedTtlSecs,
    mintRefreshThreshold,
    websafeFallbackToken,
  }, webPoSignalOutput);
  return { innertube, minter };
}

async function localYouTubeRuntime() {
  if (!localYouTubeRuntimePromise) localYouTubeRuntimePromise = createLocalYouTubeRuntime();
  try {
    return await localYouTubeRuntimePromise;
  } catch (error) {
    localYouTubeRuntimePromise = null;
    throw error;
  }
}

async function resolveInBrowser(source, { signal, onPhase } = {}) {
  onPhase?.("Verifying source locally…");
  const { innertube, minter } = await localYouTubeRuntime();
  if (signal?.aborted) throw abortError();
  const poToken = await minter.mintAsWebsafeString(source.videoId);
  onPhase?.("Reading source formats…");
  const info = await innertube.getBasicInfo(source.videoId, { client: "MWEB", po_token: poToken });
  if (signal?.aborted) throw abortError();
  const sourceFormats = [
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || []),
  ].filter((format) => !format.is_type_otf && !format.drm_families?.length && (format.has_video || format.has_audio));
  const decipherErrors = [];
  const resolved = await Promise.all(sourceFormats.map(async (format) => {
    try {
      const deciphered = await format.decipher(innertube.session.player);
      if (!deciphered) return null;
      const url = new URL(deciphered);
      url.searchParams.set("pot", poToken);
      return normalizeWorkerFormat({
        itag: format.itag,
        url: url.toString(),
        mimeType: format.mime_type,
        width: format.width,
        height: format.height,
        fps: format.fps,
        bitrate: format.bitrate,
        averageBitrate: format.average_bitrate,
        contentLength: format.content_length,
        approxDurationMs: format.approx_duration_ms,
        qualityLabel: format.quality_label,
        audioQuality: format.audio_quality,
        audioChannels: format.audio_channels,
        audioSampleRate: format.audio_sample_rate,
        language: format.language,
        isOriginal: format.is_original,
      });
    } catch (error) {
      decipherErrors.push(String(error?.message || error));
      return null;
    }
  }));
  const formats = resolved.filter(Boolean);
  if (!formats.length) {
    const detail = decipherErrors.find(Boolean) || `${sourceFormats.length} source candidates`;
    throw new Error(`YouTube did not expose a downloadable source format (${detail})`);
  }
  const details = info.basic_info || {};
  return {
    id: `youtube:${source.videoId}`,
    provider: source,
    url: source.url,
    title: details.title || "YouTube video",
    author: details.author || "YouTube",
    durationSeconds: Number(details.duration || 0),
    thumbnail: details.thumbnail?.at(-1)?.url || source.thumbnail,
    formats,
    _context: { signal: null },
  };
}

async function resolveThroughWorker(source, { signal, onPhase } = {}) {
  onPhase?.("Checking available formats…");
  let payload = {};
  let response;
  let resolvedProxy = EXTRACT_PROXY;
  let lastError;
  for (const proxy of workerProxies()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(resolveEndpoint(source.videoId, proxy), { signal, headers: { accept: "application/json" } });
      payload = await response.json().catch(() => ({}));
      if (response.ok) {
        resolvedProxy = proxy;
        lastError = null;
        break;
      }
      lastError = new Error(payload.error || `The extraction Worker returned ${response.status}.`);
      const transient = [429, 503].includes(response.status);
      if (!transient || attempt === 1) break;
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
    if (response?.ok) break;
    onPhase?.("Trying another extraction edge…");
  }
  if (!response?.ok) throw lastError || new Error("No extraction edge was available.");
  const formats = (payload.formats || [])
    .map((format) => normalizeWorkerFormat({
      ...format,
      workerSessionId: payload.browserSessionId,
      workerProxy: resolvedProxy,
    }))
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
  let response;
  let payload = {};
  let resolvedProxy = EXTRACT_PROXY;
  for (const proxy of workerProxies()) {
    const endpoint = new URL(proxy, window.location.origin);
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/resolve-social`;
    endpoint.search = "";
    endpoint.searchParams.set("url", source.url);
    response = await fetch(endpoint, { signal, headers: { accept: "application/json" } });
    payload = await response.json().catch(() => ({}));
    if (response.ok) {
      resolvedProxy = proxy;
      break;
    }
    onPhase?.("Trying another extraction edge…");
  }
  if (!response?.ok) throw new Error(payload.error || `Could not read this ${source.label} post.`);
  const formats = (payload.formats || [])
    .map((format) => normalizeWorkerFormat({
      ...format,
      workerSessionId: payload.browserSessionId,
      workerProxy: resolvedProxy,
    }))
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
    return await resolveInBrowser(source, { signal, onPhase });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw abortError();
    if (import.meta.env.DEV) console.warn("[Filzy YouTube] Local resolver failed", error);
    try {
      return await resolveThroughWorker(source, { signal, onPhase });
    } catch (workerError) {
      if (signal?.aborted || workerError?.name === "AbortError") throw abortError();
      if (import.meta.env.DEV) console.warn("[Filzy YouTube] Worker resolver failed", workerError);
      const message = String(workerError?.message || error?.message || "Could not inspect this YouTube link.");
      if (/429|rate limit|browser.*busy|unable to create new browser/i.test(message)) {
        throw new Error("The extractor is busy for a moment. Wait a few seconds, then try the link again.");
      }
      if (/fetch|network|proxy|worker|failed/i.test(message)) {
        throw new Error("Could not reach Filzy’s extractor. Check your connection and try again.");
      }
      throw new Error(message);
    }
  }
}
