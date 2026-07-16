import puppeteer from "@cloudflare/puppeteer";

const TARGET_HOSTS = [
  "youtube.com",
  "youtu.be",
  "youtubei.googleapis.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
  "piped.private.coffee",
  "kavin.rocks",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokv.com",
  "byteoversea.com",
  "ibytedtos.com",
  "muscdn.com",
  "cdninstagram.com",
  "fbcdn.net",
  "tikwm.com",
  "eepy.today",
];
const SOCIAL_SOURCE_HOSTS = ["tiktok.com", "instagram.com", "facebook.com", "fb.watch"];
const REQUEST_HEADERS = new Set(["accept", "accept-language", "content-type", "range", "user-agent", "x-origin"]);
const RESPONSE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"];
const QUALITY_PRIORITY = ["highres", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];
const PIPED_APIS = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks"];

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
    "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
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
      let directUrl = "";
      if (!captured && format.url) {
        try {
          const url = new URL(format.url);
          if (url.hostname.endsWith("googlevideo.com") && url.pathname.includes("videoplayback")) {
            directUrl = cleanMediaUrl(format.url);
          }
        } catch {
          // Signed/cipher-only entries are discovered through the live player requests.
        }
      }
      return captured || directUrl ? { ...format, url: captured?.url || directUrl } : null;
    })
    .filter(Boolean);
}

function pipedFormat(stream, index, kind) {
  const url = new URL(stream.url);
  const itag = Number(stream.itag || url.searchParams.get("itag") || (kind === "audio" ? 800_000 : 700_000) + index);
  const height = Number(stream.height || String(stream.quality || "").match(/(\d+)p/i)?.[1] || 0);
  const mimeType = stream.mimeType || (kind === "audio" ? "audio/mp4" : "video/mp4");
  const hasAudio = kind === "audio" || stream.videoOnly === false;
  return {
    itag,
    url: stream.url,
    mimeType,
    width: Number(stream.width || 0),
    height,
    fps: Number(stream.fps || 0),
    bitrate: Number(stream.bitrate || 0),
    contentLength: Math.max(0, Number(stream.contentLength || 0)),
    qualityLabel: kind === "video" ? (stream.quality || (height ? `${height}p` : "Original")) : undefined,
    audioQuality: hasAudio ? "AUDIO_QUALITY_MEDIUM" : undefined,
    audioChannels: hasAudio ? 2 : undefined,
    hasVideo: kind === "video",
    hasAudio,
  };
}

// YouTube's own InnerTube player API returns the full adaptive ladder (up to
// 2160p) with direct, unsigned media URLs when queried as an app client — no
// PO token, no signature deciphering, and no browser required. This is the
// primary free source of real source-quality streams. ANDROID_VR is the most
// reliable client for this; IOS is the fallback.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_CLIENTS = [
  {
    name: "ANDROID_VR",
    ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; en_US) gzip",
    context: { clientName: "ANDROID_VR", clientVersion: "1.60.19", deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12L", hl: "en", gl: "US" },
  },
  {
    name: "IOS",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)",
    context: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82", hl: "en", gl: "US" },
  },
];

function innerTubeFormat(format) {
  return {
    itag: Number(format.itag),
    url: format.url,
    mimeType: format.mimeType || "application/octet-stream",
    width: Number(format.width || 0),
    height: Number(format.height || 0),
    fps: Number(format.fps || 0),
    bitrate: Number(format.bitrate || format.averageBitrate || 0),
    averageBitrate: Number(format.averageBitrate || format.bitrate || 0),
    contentLength: Math.max(0, Number(format.contentLength || 0)),
    approxDurationMs: format.approxDurationMs,
    qualityLabel: format.qualityLabel,
    audioQuality: format.audioQuality,
    audioChannels: format.audioChannels,
    audioSampleRate: format.audioSampleRate,
    language: format.audioTrack?.displayName,
    isOriginal: format.audioTrack ? format.audioTrack.audioIsDefault !== false : true,
  };
}

async function resolveWithInnerTube(videoId) {
  let lastError;
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const response = await fetch(`https://youtubei.googleapis.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": client.ua,
          "x-goog-api-format-version": "2",
          origin: "https://www.youtube.com",
        },
        body: JSON.stringify({ context: { client: client.context }, videoId, contentCheckOk: true, racyCheckOk: true }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`InnerTube ${client.name} returned ${response.status}`);
      const data = await response.json();
      const status = data?.playabilityStatus?.status;
      if (status !== "OK") throw new Error(`${client.name}: ${data?.playabilityStatus?.reason || status || "unplayable"}`);
      const streamingData = data.streamingData || {};
      const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])]
        .filter((format) => format?.url && allowedTarget(format.url))
        .map(innerTubeFormat);
      if (!formats.length) throw new Error(`InnerTube ${client.name} exposed no direct formats`);
      const details = data.videoDetails || {};
      return {
        title: details.title || "YouTube video",
        author: details.author || "YouTube",
        durationSeconds: Number(details.lengthSeconds || 0),
        thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        formats,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("InnerTube resolution failed");
}

async function resolveWithPiped(videoId) {
  let lastError;
  for (const api of PIPED_APIS) {
    try {
      const response = await fetch(`${api}/streams/${videoId}`, {
        headers: { accept: "application/json", "user-agent": "Filzy/1.0" },
        signal: AbortSignal.timeout(6_500),
      });
      if (!response.ok) throw new Error(`Piped returned ${response.status}`);
      const payload = await response.json();
      const audio = (payload.audioStreams || [])
        .filter((stream) => stream?.url && allowedTarget(stream.url) && !/hls/i.test(stream.format || stream.mimeType || ""))
        .map((stream, index) => pipedFormat(stream, index, "audio"));
      const video = (payload.videoStreams || [])
        .filter((stream) => stream?.url && allowedTarget(stream.url) && !/hls|m3u8/i.test(stream.format || stream.mimeType || ""))
        .map((stream, index) => pipedFormat(stream, index, "video"));
      if (!video.length && !audio.length) throw new Error("Piped returned no downloadable streams");

      const formats = [...video, ...audio];
      if (!audio.length) {
        const combined = video.find((format) => format.hasAudio);
        if (combined) {
          formats.push({
            ...combined,
            itag: 900_000 + Number(combined.itag || 0),
            mimeType: "audio/mp4; codecs=\"mp4a.40.2\"",
            width: undefined,
            height: undefined,
            fps: undefined,
            qualityLabel: undefined,
            hasVideo: false,
            hasAudio: true,
            derivedFromVideo: true,
          });
        }
      }

      return {
        title: payload.title || "YouTube video",
        author: payload.uploader || "YouTube",
        durationSeconds: Number(payload.duration || 0),
        thumbnail: payload.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        formats,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No direct extraction source was available");
}

async function launchBrowser(env) {
  try {
    const sessions = await puppeteer.sessions(env.BROWSER);
    const idle = sessions
      .filter((session) => !session.connectionId)
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));
    if (idle.length) return await puppeteer.connect(env.BROWSER, idle.at(-1).sessionId);
  } catch {
    // A stale session may disappear between listing and reconnecting.
  }
  return puppeteer.launch(env.BROWSER, { keep_alive: 180_000 });
}

async function resolveWithBrowser(env, videoId) {
  const browser = await launchBrowser(env);
  const existingPages = await browser.pages();
  const page = await browser.newPage();
  await Promise.all(existingPages.map((existing) => existing.close().catch(() => {})));
  const captured = new Map();
  const childSessions = [];
  const childAttachTasks = new Set();
  let cdp;
  let keepSession = false;
  let attachMediaTarget = () => {};

  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      // Keep MediaSource available, but make YouTube use its main-thread media
      // pipeline so the page CDP session can observe the signed byte requests.
      Object.defineProperty(globalThis, "Worker", { configurable: true, value: undefined });
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
    attachMediaTarget = (target) => {
      if (!["worker", "service_worker", "shared_worker"].includes(target.type?.())) return;
      const task = (async () => {
        try {
          const session = await target.createCDPSession();
          childSessions.push(session);
          await session.send("Network.enable");
          session.on("Network.requestWillBeSent", (event) => capture(event.request?.url));
          session.on("Network.responseReceived", (event) => capture(event.response?.url));
        } catch {
          // Some shared browser targets disappear before CDP can attach.
        }
      })();
      childAttachTasks.add(task);
      task.finally(() => childAttachTasks.delete(task));
    };
    browser.on("targetcreated", attachMediaTarget);
    for (const target of browser.targets()) attachMediaTarget(target);
    page.on("request", (event) => capture(event.url()));
    try {
      cdp = await page.target().createCDPSession();
      await cdp.send("Network.enable");
      await cdp.send("Network.setBypassServiceWorker", { bypass: true });
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      cdp.on("Network.requestWillBeSent", (event) => capture(event.request?.url));
      cdp.on("Network.responseReceived", (event) => capture(event.response?.url));
    } catch {
      cdp = null;
    }

    await page.goto(`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForSelector("#movie_player", { timeout: 10_000 });

    let playerResponseText = await page.evaluate(() => {
      const response = document.getElementById("movie_player")?.getPlayerResponse?.()
        || globalThis.ytInitialPlayerResponse
        || globalThis.ytplayer?.config?.args?.raw_player_response
        || null;
      return typeof response === "string" ? response : JSON.stringify(response);
    });
    let playerResponse = JSON.parse(playerResponseText || "null");
    if (playerResponse?.playabilityStatus?.status !== "OK") {
      await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await page.waitForSelector("#movie_player", { timeout: 10_000 });
      playerResponseText = await page.evaluate(() => {
        const response = document.getElementById("movie_player")?.getPlayerResponse?.()
          || globalThis.ytInitialPlayerResponse
          || globalThis.ytplayer?.config?.args?.raw_player_response
          || null;
        return typeof response === "string" ? response : JSON.stringify(response);
      });
      playerResponse = JSON.parse(playerResponseText || "null");
    }
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
    await Promise.allSettled([...childAttachTasks]);

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
    const outputFormats = [...formats];
    if (!formats.some((format) => format.mimeType?.startsWith("audio/"))) {
      const combined = formats.find((format) => format.audioQuality || format.audioChannels);
      if (combined) {
        outputFormats.push({
          ...combined,
          itag: 900_000 + Number(combined.itag || 0),
          mimeType: "audio/mp4; codecs=\"mp4a.40.2\"",
          width: undefined,
          height: undefined,
          fps: undefined,
          qualityLabel: undefined,
          hasVideo: false,
          hasAudio: true,
          derivedFromVideo: true,
        });
      }
    }

    keepSession = true;
    return {
      browserSessionId: browser.sessionId(),
      title: details.title || "YouTube video",
      author: details.author || "YouTube",
      durationSeconds: Number(details.lengthSeconds || 0),
      thumbnail: details.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      formats: outputFormats,
    };
  } finally {
    browser.off("targetcreated", attachMediaTarget);
    await Promise.all(childSessions.map((session) => session.detach().catch(() => {})));
    await cdp?.detach().catch(() => {});
    if (keepSession) {
      // Downloads reconnect to this session, so keep the browser alive.
      await browser.disconnect().catch(() => {});
    } else {
      // Fully close on failure. Disconnecting would leave the browser running
      // for its keep_alive window, leaking a Browser Rendering concurrency slot
      // and quickly exhausting the account limit (429: Unable to create browser).
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

// Free, browser-free social resolution. TikTok goes through tikwm (returns a
// no-watermark MP4 + audio on tiktokcdn, which we can proxy). Instagram and
// Facebook are best-effort through a public cobalt instance, which tunnels the
// media file; they can fail if the instance is blocked upstream, in which case
// the caller falls back to the browser resolver.
const COBALT_INSTANCES = ["https://co.eepy.today/"];

function directSocialFormats(videoUrl, audioUrl, meta = {}) {
  return [
    {
      itag: 1000,
      url: videoUrl,
      mimeType: 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"',
      width: Number(meta.width || 0),
      height: Number(meta.height || 0),
      fps: Number(meta.fps || 0),
      qualityLabel: meta.height ? `${meta.height}p` : "Original",
      // Progressive file (audio muxed in) — flag audio so the client downloads
      // it once instead of pulling the stream twice to re-mux it.
      audioQuality: "SOURCE_AUDIO",
      audioChannels: 2,
      hasVideo: true,
      hasAudio: true,
    },
    {
      itag: 1001,
      url: audioUrl || videoUrl,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      audioQuality: "SOURCE_AUDIO",
      audioChannels: 2,
      hasVideo: false,
      hasAudio: true,
      derivedFromVideo: true,
    },
  ];
}

async function resolveViaTikwm(target) {
  const response = await fetch(`https://www.tikwm.com/api/?hd=1&url=${encodeURIComponent(target)}`, {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`tikwm returned ${response.status}`);
  const payload = await response.json();
  const data = payload?.data;
  if (payload?.code !== 0 || !data) throw new Error(payload?.msg || "TikTok resolve failed");
  const video = data.hdplay || data.play || data.wmplay;
  if (!video || !allowedTarget(video)) throw new Error("TikTok did not expose a downloadable video");
  const audio = allowedTarget(data.music || "") ? data.music : video;
  return {
    title: data.title || "TikTok video",
    author: data.author?.nickname || data.author?.unique_id || "TikTok",
    durationSeconds: Number(data.duration || 0),
    thumbnail: data.cover || data.origin_cover || "",
    formats: directSocialFormats(video, audio),
  };
}

async function resolveViaCobalt(target) {
  let lastError;
  for (const base of COBALT_INSTANCES) {
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0" },
        body: JSON.stringify({ url: target, videoQuality: "max", filenameStyle: "basic" }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json();
      let mediaUrl = ["tunnel", "redirect"].includes(data?.status) ? data.url : null;
      if (!mediaUrl && data?.status === "picker" && Array.isArray(data.picker)) {
        mediaUrl = (data.picker.find((item) => item.type === "video") || data.picker[0])?.url || null;
      }
      if (mediaUrl && allowedTarget(mediaUrl)) return { url: mediaUrl, filename: data.filename };
      throw new Error(data?.error?.code || `cobalt status ${data?.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("cobalt resolution failed");
}

function socialHandle(target) {
  try {
    const match = new URL(target).pathname.match(/@([\w.]+)/);
    return match ? `@${match[1]}` : "";
  } catch {
    return "";
  }
}

async function resolveSocialDirect(target) {
  const host = new URL(target).hostname;
  const isTikTok = host === "tiktok.com" || host.endsWith(".tiktok.com");
  const platform = isTikTok ? "TikTok" : host.endsWith("instagram.com") ? "Instagram" : "Facebook";
  const handle = socialHandle(target);
  const label = handle ? `${platform} · ${handle}` : `${platform} video`;

  if (isTikTok) {
    try {
      return await resolveViaTikwm(target);
    } catch (tikwmError) {
      const cobalt = await resolveViaCobalt(target).catch(() => { throw tikwmError; });
      return { title: label, author: handle || "TikTok", durationSeconds: 0, thumbnail: "", formats: directSocialFormats(cobalt.url, cobalt.url) };
    }
  }
  const cobalt = await resolveViaCobalt(target);
  return { title: label, author: handle || platform, durationSeconds: 0, thumbnail: "", formats: directSocialFormats(cobalt.url, cobalt.url) };
}

async function resolveSocialWithBrowser(env, target) {
  const browser = await launchBrowser(env);
  const existingPages = await browser.pages();
  const page = await browser.newPage();
  await Promise.all(existingPages.map((existing) => existing.close().catch(() => {})));
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
    if (!resource?.success || !resource.stream) {
      const fallback = await page.evaluate(async (url) => {
        const response = await fetch(url, { cache: "no-store", credentials: "include" });
        const buffer = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let start = 0; start < buffer.length; start += 0x8000) {
          binary += String.fromCharCode(...buffer.subarray(start, start + 0x8000));
        }
        return {
          ok: response.ok,
          status: response.status,
          data: btoa(binary),
          contentType: response.headers.get("content-type"),
          contentRange: response.headers.get("content-range"),
        };
      }, mediaUrl.toString());
      if (!fallback.ok) throw new Error(`Source returned ${fallback.status || resource?.httpStatusCode || "an error"}`);
      const binary = atob(fallback.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const headers = new Headers({
        "content-type": fallback.contentType || "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "accept-ranges": "bytes",
      });
      if (fallback.contentRange) headers.set("content-range", fallback.contentRange);
      return { bytes, headers };
    }
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
      // InnerTube (ANDROID_VR/IOS clients) is the primary source: it returns
      // the full adaptive ladder up to 2160p with direct, unsigned URLs for
      // free. Piped is a fallback for the rare video InnerTube refuses, and the
      // browser resolver is the last resort (unavailable on the free plan).
      const errors = [];
      for (const [label, resolve] of [
        ["innertube", () => resolveWithInnerTube(videoId)],
        ["piped", () => resolveWithPiped(videoId)],
        ["browser", () => resolveWithBrowser(env, videoId)],
      ]) {
        try {
          return json(await resolve(), 200, origin);
        } catch (error) {
          errors.push(`${label}: ${error?.message || error}`);
        }
      }
      return json({ error: errors.join(" · ") || "Could not resolve this YouTube video" }, 502, origin);
    }

    if (requestUrl.pathname === "/resolve-social") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, origin);
      const target = requestUrl.searchParams.get("url") || "";
      if (!allowedSocialSource(target)) return json({ error: "Unsupported social media link" }, 400, origin);
      // Free direct resolvers first (tikwm for TikTok, cobalt for IG/FB); the
      // browser resolver is a fallback and is unavailable on the free plan.
      const socialErrors = [];
      for (const [label, resolve] of [
        ["direct", () => resolveSocialDirect(target)],
        ["browser", () => resolveSocialWithBrowser(env, target)],
      ]) {
        try {
          return json(await resolve(), 200, origin);
        } catch (error) {
          socialErrors.push(`${label}: ${error?.message || error}`);
        }
      }
      const host = (() => { try { return new URL(target).hostname.replace(/^www\./, ""); } catch { return "This"; } })();
      const isMeta = /instagram\.com|facebook\.com|fb\.watch/.test(host);
      const message = isMeta
        ? "Instagram and Facebook block free extraction right now. TikTok and YouTube links work."
        : "Could not read this post. Try a TikTok or YouTube link.";
      return json({ error: message, detail: socialErrors.join(" · ") }, 502, origin);
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
