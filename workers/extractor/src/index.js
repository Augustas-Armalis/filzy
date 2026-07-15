import puppeteer from "@cloudflare/puppeteer";

const TARGET_HOSTS = [
  "youtube.com",
  "youtu.be",
  "youtubei.googleapis.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokv.com",
  "byteoversea.com",
  "ibytedtos.com",
  "muscdn.com",
  "cdninstagram.com",
  "fbcdn.net",
];
const SOCIAL_SOURCE_HOSTS = ["tiktok.com", "instagram.com", "facebook.com", "fb.watch"];
const REQUEST_HEADERS = new Set(["accept", "accept-language", "content-type", "range", "user-agent", "x-origin"]);
const RESPONSE_HEADERS = ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"];
const QUALITY_PRIORITY = ["highres", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];

function allowedTarget(value) {
  try {
    const target = new URL(value);
    return target.protocol === "https:"
      && !target.username
      && !target.password
      && (!target.port || target.port === "443")
      && TARGET_HOSTS.some((domain) => target.hostname === domain || target.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "Accept, Accept-Language, Content-Type, Range, X-Goog-Visitor-Id, X-Origin, X-Youtube-Client-Name, X-Youtube-Client-Version",
    "access-control-expose-headers": "Content-Range, Accept-Ranges, Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  });
  if (origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(data, status, origin) {
  const headers = corsHeaders(origin);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanMediaUrl(value) {
  const url = new URL(value);
  for (const key of ["range", "rn", "rbuf"]) url.searchParams.delete(key);
  return url.toString();
}

function mediaItag(url) {
  return Number(url.searchParams.get("itag") || url.pathname.match(/\/itag\/(\d+)/)?.[1] || 0);
}

function playerFormats(playerResponse, capturedUrls) {
  const streamingData = playerResponse?.streamingData || {};
  const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
  return formats
    .map((format) => {
      const captured = capturedUrls.find((entry) => Number(entry.itag) === Number(format.itag));
      return captured ? { ...format, url: captured.url } : null;
    })
    .filter(Boolean);
}

async function launchBrowser(env) {
  try {
    const sessions = await puppeteer.sessions(env.BROWSER);
    const idle = sessions
      .filter((session) => !session.connectionId)
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));
    if (sessions.length >= 2 && idle.length) {
      const stale = await puppeteer.connect(env.BROWSER, idle[0].sessionId);
      await stale.close().catch(() => {});
    }
  } catch {
    // Session cleanup is best effort; launch still reports the real limit.
  }
  return puppeteer.launch(env.BROWSER, { keep_alive: 120_000 });
}

async function resolveWithBrowser(env, videoId) {
  const browser = await launchBrowser(env);
  const page = await browser.newPage();
  const captured = new Map();
  let cdp;
  let keepSession = false;

  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(globalThis, "MediaSource", { value: undefined, configurable: true });
        Object.defineProperty(globalThis, "WebKitMediaSource", { value: undefined, configurable: true });
      } catch {
        // The request/currentSrc capture remains available when a runtime locks these globals.
      }
    });
    await page.setCookie({
      name: "CONSENT",
      value: "YES+cb.20210328-17-p0.en+FX+667",
      domain: ".youtube.com",
      path: "/",
    });
    const capture = (value) => {
      try {
        const url = new URL(value);
        if (!url.hostname.endsWith("googlevideo.com") || !url.pathname.includes("videoplayback")) return;
        const itag = mediaItag(url);
        if (itag && !captured.has(itag)) captured.set(itag, cleanMediaUrl(url.toString()));
      } catch {
        // Ignore unrelated or malformed browser requests.
      }
    };
    page.on("request", (event) => capture(event.url()));
    try {
      cdp = await page.target().createCDPSession();
      await cdp.send("Network.enable");
      cdp.on("Network.requestWillBeSent", (event) => capture(event.request?.url));
      cdp.on("Network.responseReceived", (event) => capture(event.response?.url));
    } catch {
      cdp = null;
    }

    await page.goto(`https://www.youtube.com/watch?v=${videoId}&autoplay=1`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForSelector("#movie_player", { timeout: 10_000 });

    const playerResponseText = await page.evaluate(() => {
      const response = globalThis.ytInitialPlayerResponse
        || globalThis.ytplayer?.config?.args?.raw_player_response
        || null;
      return typeof response === "string" ? response : JSON.stringify(response);
    });
    const playerResponse = JSON.parse(playerResponseText || "null");
    if (playerResponse?.playabilityStatus?.status !== "OK") {
      throw new Error(playerResponse?.playabilityStatus?.reason || "YouTube did not return a playable source");
    }

    const levelsText = await page.evaluate(async () => {
      const player = document.getElementById("movie_player");
      if (!player) return "[]";
      player.mute?.();
      player.playVideo?.();
      const video = document.querySelector("video");
      if (video) {
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => {});
      }
      return JSON.stringify(player.getAvailableQualityLevels?.() || []);
    });
    const availableLevels = JSON.parse(levelsText || "[]");
    const levels = QUALITY_PRIORITY.filter((quality) => availableLevels.includes(quality)).slice(0, 5);
    for (const [index, quality] of (levels.length ? levels : ["highres"]).entries()) {
      await page.evaluate(async ({ level, seekTo }) => {
        const player = document.getElementById("movie_player");
        player?.setPlaybackQualityRange?.(level, level);
        player?.setPlaybackQuality?.(level);
        player?.seekTo?.(seekTo, true);
        player?.playVideo?.();
        const video = document.querySelector("video");
        if (video) {
          video.muted = true;
          await video.play().catch(() => {});
        }
      }, { level: quality, seekTo: Math.min(10 + index * 18, Math.max(1, Number(playerResponse.videoDetails?.lengthSeconds || 20) - 2)) });
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const performanceUrls = JSON.parse(await page.evaluate(() => JSON.stringify(
      performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes("googlevideo.com/videoplayback")),
    )) || "[]");
    for (const value of performanceUrls) {
      try {
        const url = new URL(value);
        const itag = mediaItag(url);
        if (itag && !captured.has(itag)) captured.set(itag, cleanMediaUrl(value));
      } catch {
        // Ignore expired performance entries.
      }
    }
    const currentSrc = await page.evaluate(() => document.querySelector("video")?.currentSrc || "");
    if (currentSrc) {
      try {
        const url = new URL(currentSrc);
        const itag = mediaItag(url);
        if (url.hostname.endsWith("googlevideo.com") && itag && !captured.has(itag)) captured.set(itag, cleanMediaUrl(currentSrc));
      } catch {
        // A MediaSource blob cannot be proxied and is ignored.
      }
    }

    const capturedUrls = [...captured].map(([itag, url]) => ({ itag, url }));
    const formats = playerFormats(playerResponse, capturedUrls);
    const details = playerResponse.videoDetails || {};
    if (!formats.length) {
      const state = await page.evaluate(() => ({
        playerState: document.getElementById("movie_player")?.getPlayerState?.(),
        videoReadyState: document.querySelector("video")?.readyState,
      }));
      throw new Error(`YouTube did not expose a downloadable media stream (${availableLevels.length} qualities, state ${state.playerState ?? "?"}, ready ${state.videoReadyState ?? "?"})`);
    }

    keepSession = true;
    return {
      browserSessionId: browser.sessionId(),
      title: details.title || "YouTube video",
      author: details.author || "YouTube",
      durationSeconds: Number(details.lengthSeconds || 0),
      thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      formats,
    };
  } finally {
    await cdp?.detach().catch(() => {});
    if (keepSession) await browser.disconnect().catch(() => {});
    else {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }
}

function allowedSocialSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SOCIAL_SOURCE_HOSTS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function resolveSocialWithBrowser(env, target) {
  const browser = await launchBrowser(env);
  const page = await browser.newPage();
  const mediaRequests = [];
  let keepSession = false;
  try {
    const sourceUrl = new URL(target);
    const tiktokId = sourceUrl.hostname.endsWith("tiktok.com") ? sourceUrl.pathname.match(/\/video\/(\d+)/)?.[1] : null;
    const navigationTarget = tiktokId
      ? `https://www.tiktok.com/player/v1/${tiktokId}?autoplay=1&loop=0&description=1`
      : target;
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    page.on("request", (request) => {
      try {
        const value = request.url();
        if (request.resourceType() === "media" && allowedTarget(value)) mediaRequests.push(value);
      } catch {
        // Ignore non-media requests.
      }
    });
    await page.goto(navigationTarget, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const data = await page.evaluate(async () => {
      const video = document.querySelector("video");
      if (video) {
        video.muted = true;
        await video.play().catch(() => {});
      }
      const meta = (property) => document.querySelector(`meta[property="${property}"],meta[name="${property}"]`)?.content || "";
      const embeddedUrls = [];
      const hydration = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent;
      if (hydration) {
        try {
          const data = JSON.parse(hydration);
          const item = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
          for (const value of [item?.video?.playAddr, item?.video?.downloadAddr]) if (value) embeddedUrls.push(value);
        } catch {
          // Fall through to the narrowly scoped serialized-URL patterns.
        }
      }
      const html = document.documentElement.innerHTML;
      for (const pattern of [
        /\"(?:playAddr|downloadAddr|video_url|playable_url|playable_url_quality_hd|contentUrl)\"\s*:\s*\"(https:[^\"]+)\"/g,
      ]) {
        for (const match of html.matchAll(pattern)) {
          embeddedUrls.push(match[1]
            .replaceAll("\\u002F", "/")
            .replaceAll("\\u0026", "&")
            .replaceAll("\\/", "/")
            .replaceAll("&amp;", "&"));
          if (embeddedUrls.length >= 12) break;
        }
      }
      return {
        title: meta("og:title") || document.title,
        author: meta("og:site_name"),
        thumbnail: meta("og:image"),
        ogVideo: meta("og:video:secure_url") || meta("og:video"),
        currentSrc: video?.currentSrc || video?.src || "",
        durationSeconds: Number(video?.duration || 0),
        width: Number(video?.videoWidth || 0),
        height: Number(video?.videoHeight || 0),
        embeddedUrls,
      };
    });
    const candidate = [data.currentSrc, data.ogVideo, ...data.embeddedUrls, ...mediaRequests]
      .find((value) => value && allowedTarget(value));
    if (!candidate) throw new Error("This post did not expose public downloadable media");
    keepSession = true;
    return {
      browserSessionId: browser.sessionId(),
      title: data.title || "Social video",
      author: data.author || new URL(target).hostname.replace(/^www\./, ""),
      durationSeconds: Number.isFinite(data.durationSeconds) ? data.durationSeconds : 0,
      thumbnail: data.thumbnail || "",
      formats: [
        {
          itag: 1000,
          url: candidate,
          mimeType: "video/mp4; codecs=\"avc1, mp4a\"",
          width: data.width,
          height: data.height,
          qualityLabel: data.height ? `${data.height}p` : "Original",
          hasVideo: true,
          hasAudio: true,
        },
        {
          itag: 1001,
          url: candidate,
          mimeType: "audio/mp4; codecs=\"mp4a\"",
          audioQuality: "SOURCE_AUDIO",
          hasVideo: false,
          hasAudio: true,
          derivedFromVideo: true,
        },
      ],
    };
  } finally {
    if (keepSession) await browser.disconnect().catch(() => {});
    else {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }
}

async function browserMediaChunk(env, sessionId, target, range, closeAfter) {
  const browser = await puppeteer.connect(env.BROWSER, sessionId);
  let cdp;
  try {
    const [page] = await browser.pages();
    if (!page) throw new Error("The extraction session has expired");
    cdp = await page.target().createCDPSession();
    const frameTree = await cdp.send("Page.getFrameTree");
    const mediaUrl = new URL(target);
    mediaUrl.searchParams.set("range", range.replace(/^bytes=/, ""));
    const loaded = await cdp.send("Network.loadNetworkResource", {
      frameId: frameTree.frameTree.frame.id,
      url: mediaUrl.toString(),
      options: { disableCache: true, includeCredentials: false },
    });
    const resource = loaded.resource;
    if (!resource?.success || !resource.stream) throw new Error(resource?.netErrorName || `Source returned ${resource?.httpStatusCode || "an error"}`);
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const part = await cdp.send("IO.read", { handle: resource.stream, size: 1024 * 1024 });
      const binary = part.base64Encoded ? atob(part.data) : part.data;
      const chunk = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) chunk[index] = binary.charCodeAt(index);
      if (chunk.byteLength) {
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
      }
      if (part.eof) break;
    }
    await cdp.send("IO.close", { handle: resource.stream }).catch(() => {});
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const responseHeaders = resource.headers || {};
    const headers = new Headers({
      "content-type": responseHeaders["content-type"] || responseHeaders["Content-Type"] || "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "accept-ranges": "bytes",
    });
    const contentRange = responseHeaders["content-range"] || responseHeaders["Content-Range"];
    if (contentRange) headers.set("content-range", contentRange);
    return { bytes, headers };
  } finally {
    await cdp?.detach().catch(() => {});
    if (closeAfter) await browser.close().catch(() => {});
    else await browser.disconnect().catch(() => {});
  }
}

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (REQUEST_HEADERS.has(lower) || lower.startsWith("x-youtube-") || lower.startsWith("x-goog-")) headers.set(name, value);
  }
  return headers;
}

function stableUpstreamTarget(target, method) {
  const url = new URL(target);
  if (method === "POST" && url.hostname === "www.youtube.com" && url.pathname.startsWith("/youtubei/")) {
    // Cloudflare's shared youtube.com egress is frequently served Google's
    // automated-query interstitial. The same InnerTube API is available at
    // Google's dedicated API host and is considerably more reliable here.
    url.hostname = "youtubei.googleapis.com";
  }
  return url.toString();
}

async function fetchAllowed(target, init) {
  let current = target;
  let method = init.method;
  let body = init.body;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, { ...init, method, body, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Too many upstream redirects");
    const next = new URL(location, current).toString();
    if (!allowedTarget(next)) throw new Error("Blocked upstream redirect");
    await response.body?.cancel();
    if (method === "POST" && [301, 302, 303].includes(response.status)) {
      method = "GET";
      body = undefined;
    } else if (body && [307, 308].includes(response.status)) {
      throw new Error("Cannot replay a streamed request body");
    }
    current = next;
  }
  throw new Error("Upstream redirect failed");
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === null) return json({ error: "Origin not allowed" }, 403, "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/browser-media") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
      const sessionId = requestUrl.searchParams.get("sessionId") || "";
      const target = requestUrl.searchParams.get("url") || "";
      const match = (request.headers.get("range") || "bytes=0-1048575").match(/^bytes=(\d+)-(\d+)$/);
      if (!sessionId || !allowedTarget(target) || !match) return json({ error: "Invalid media chunk request" }, 400, origin);
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start + 1 > 1024 * 1024) {
        return json({ error: "Media chunks are limited to 1 MB" }, 416, origin);
      }
      try {
        const result = await browserMediaChunk(env, sessionId, target, `bytes=${start}-${end}`, requestUrl.searchParams.get("close") === "1");
        const headers = corsHeaders(origin);
        result.headers.forEach((value, name) => headers.set(name, value));
        return new Response(result.bytes, { status: 206, headers });
      } catch (error) {
        return json({ error: String(error?.message || "The extraction session expired") }, 410, origin);
      }
    }

    if (requestUrl.pathname === "/resolve" || requestUrl.searchParams.has("videoId")) {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
      const videoId = requestUrl.searchParams.get("videoId") || "";
      if (!/^[\w-]{11}$/.test(videoId)) return json({ error: "Invalid YouTube video id" }, 400, origin);
      try {
        return json(await resolveWithBrowser(env, videoId), 200, origin);
      } catch (error) {
        return json({ error: String(error?.message || "Could not resolve this YouTube video") }, 502, origin);
      }
    }

    if (requestUrl.pathname === "/resolve-social") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
      const target = requestUrl.searchParams.get("url") || "";
      if (!allowedSocialSource(target)) return json({ error: "Unsupported social media link" }, 400, origin);
      try {
        return json(await resolveSocialWithBrowser(env, target), 200, origin);
      } catch (error) {
        return json({ error: String(error?.message || "Could not resolve this public post") }, 502, origin);
      }
    }

    if (!["GET", "HEAD", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, 405, origin);

    const target = requestUrl.searchParams.get("url") || "";
    if (!allowedTarget(target)) return json({ error: "Unsupported extraction target" }, 400, origin);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 2 * 1024 * 1024) return json({ error: "Request body is too large" }, 413, origin);

    try {
      const upstreamTarget = stableUpstreamTarget(target, request.method);
      const requestHeaders = upstreamHeaders(request);
      if (new URL(upstreamTarget).hostname.endsWith("youtube.com") && request.method === "POST") {
        requestHeaders.set("origin", "https://www.youtube.com");
      }
      const upstream = await fetchAllowed(upstreamTarget, {
        method: request.method,
        headers: requestHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      });
      const responseHeaders = corsHeaders(origin);
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    } catch {
      return json({ error: "The upstream media request failed" }, 502, origin);
    }
  },
};
