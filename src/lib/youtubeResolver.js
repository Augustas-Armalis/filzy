import { EXTRACT_PROXY, normalizeYouTubeFormat } from "@/lib/extract";

function abortError() {
  return new DOMException("Extraction cancelled", "AbortError");
}

function combinedSignal(primary, secondary) {
  const signals = [primary, secondary].filter(Boolean);
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signals.forEach((signal) => {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  return controller.signal;
}

function proxyUrl(target) {
  const endpoint = new URL(EXTRACT_PROXY, window.location.origin);
  endpoint.searchParams.set("url", target);
  return endpoint.toString();
}

function makeProxyFetch(context) {
  return async (input, init) => {
    const isRequest = input instanceof Request;
    const target = isRequest ? input.url : input?.href || String(input);
    const method = String(init?.method || (isRequest ? input.method : "GET")).toUpperCase();
    const headers = new Headers(isRequest ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    headers.delete("cookie");
    headers.delete("authorization");
    // `origin` belongs to the browser -> Worker request. YouTube.js includes
    // YouTube's upstream origin, which would make the Worker treat YouTube as
    // the calling website and reject the request. The Worker restores the
    // correct upstream Origin after it has validated Filzy's real origin.
    headers.delete("origin");

    let body;
    if (!["GET", "HEAD"].includes(method)) {
      if (init && Object.prototype.hasOwnProperty.call(init, "body")) body = init.body;
      else if (isRequest) body = await input.clone().arrayBuffer();
    }
    const response = await fetch(proxyUrl(target), {
      method,
      headers,
      body,
      redirect: init?.redirect || (isRequest ? input.redirect : "follow"),
      signal: combinedSignal(context.signal, init?.signal || (isRequest ? input.signal : undefined)),
    });

    if (response.status === 404 && new URL(EXTRACT_PROXY, window.location.origin).origin === window.location.origin) {
      throw new Error("Filzy’s extraction Worker is not connected on this deployment.");
    }
    return response;
  };
}

function largestThumbnail(thumbnails = []) {
  return [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || "";
}

export async function resolveYouTube(source, { signal, onPhase } = {}) {
  if (signal?.aborted) throw abortError();
  onPhase?.("Reading source…");

  const context = { signal };
  try {
    const { Innertube, UniversalCache } = await import("youtubei.js/web");
    if (signal?.aborted) throw abortError();
    onPhase?.("Checking available formats…");

    const client = await Innertube.create({
      fetch: makeProxyFetch(context),
      cache: new UniversalCache(false),
      enable_session_cache: true,
      // iOS and Android VR return direct media URLs, so no brittle parsing or
      // execution of YouTube's frequently changing web player is required.
      retrieve_player: false,
    });
    if (signal?.aborted) throw abortError();

    let info = await client.getBasicInfo(source.videoId, { client: "IOS" });
    if (signal?.aborted) throw abortError();
    let rawFormats = [
      ...(info.streaming_data?.formats || []),
      ...(info.streaming_data?.adaptive_formats || []),
    ];
    if (!rawFormats.some((format) => format.url)) {
      info = await client.getBasicInfo(source.videoId, { client: "ANDROID_VR" });
      rawFormats = [...(info.streaming_data?.formats || []), ...(info.streaming_data?.adaptive_formats || [])];
    }
    rawFormats = rawFormats.filter((format) => format.url);
    const formats = rawFormats
      .filter((format) => !format.drm_families?.length && (format.has_video || format.has_audio))
      .map(normalizeYouTubeFormat)
      .filter((format) => format.itag && format.container);

    if (!formats.length) throw new Error("No downloadable source formats were returned for this video.");
    const basic = info.basic_info || {};
    return {
      id: `youtube:${source.videoId}`,
      provider: source,
      url: source.url,
      title: basic.title || "YouTube video",
      author: basic.channel?.name || basic.author || "YouTube",
      durationSeconds: Number(basic.duration || 0),
      thumbnail: largestThumbnail(basic.thumbnail) || source.thumbnail,
      formats,
      _info: info,
      _context: context,
    };
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw abortError();
    const message = String(error?.message || "Could not inspect this YouTube link.");
    if (/fetch|network|proxy|worker|failed/i.test(message)) {
      throw new Error("Could not reach Filzy’s extraction Worker. Check the Worker URL and try again.");
    }
    throw error;
  } finally {
    context.signal = null;
  }
}
