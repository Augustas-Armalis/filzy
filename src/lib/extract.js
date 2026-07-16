const SOCIAL_HOSTS = new Map([
  ["tiktok.com", "TikTok"],
  ["instagram.com", "Instagram"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["facebook.com", "Facebook"],
  ["fb.watch", "Facebook"],
  ["vimeo.com", "Vimeo"],
  ["soundcloud.com", "SoundCloud"],
  ["twitch.tv", "Twitch"],
  ["reddit.com", "Reddit"],
  ["dailymotion.com", "Dailymotion"],
]);

const DEFAULT_EXTRACT_PROXY = import.meta.env.DEV
  ? "/api/extract-proxy"
  : "https://filzy-extractor.trycapto.workers.dev";

export const EXTRACT_PROXY = (import.meta.env.VITE_EXTRACT_PROXY || DEFAULT_EXTRACT_PROXY).replace(/\/$/, "");

export const TARGETS = [
  { value: "mp4", label: "MP4", kind: "video" },
  { value: "mp3", label: "MP3", kind: "audio" },
  { value: "m4a", label: "M4A", kind: "audio" },
  { value: "webm", label: "WEBM", kind: "video" },
];

const CODEC_LABELS = [
  [/^avc1|h264/i, "H.264"],
  [/^hev1|^hvc1|hevc/i, "HEVC"],
  [/^av01|av1/i, "AV1"],
  [/^vp09|vp9/i, "VP9"],
  [/^vp8/i, "VP8"],
  [/^mp4a|aac/i, "AAC"],
  [/opus/i, "Opus"],
  [/vorbis/i, "Vorbis"],
];

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function youtubeVideoId(url) {
  if (hostMatches(url.hostname, "youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || null;
  if (!hostMatches(url.hostname, "youtube.com")) return null;
  const queryId = url.searchParams.get("v");
  if (queryId) return queryId;
  const parts = url.pathname.split("/").filter(Boolean);
  if (["shorts", "live", "embed"].includes(parts[0])) return parts[1] || null;
  return null;
}

function knownSocialProvider(hostname) {
  for (const [domain, label] of SOCIAL_HOSTS) {
    if (hostMatches(hostname, domain)) return label;
  }
  return null;
}

function socialProviderId(label) {
  if (label === "TikTok") return "tiktok";
  if (label === "Instagram") return "instagram";
  if (label === "Facebook") return "facebook";
  return null;
}

export function inspectMediaLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return { state: "empty", source: null, message: "" };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { state: "invalid", source: null, message: "Paste the complete link, including https://" };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { state: "invalid", source: null, message: "Use a public https:// link." };
  }

  if (hostMatches(url.hostname, "youtube.com") || hostMatches(url.hostname, "youtu.be")) {
    const videoId = youtubeVideoId(url);
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return { state: "unsupported", source: null, message: "Paste a YouTube video, Short, or live replay link." };
    }
    return {
      state: "supported",
      message: "YouTube detected",
      source: {
        id: "youtube",
        label: "YouTube",
        color: "#FF0033",
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    };
  }

  const provider = knownSocialProvider(url.hostname);
  const providerId = socialProviderId(provider);
  if (providerId) {
    return {
      state: "supported",
      message: `${provider} detected`,
      source: { id: providerId, label: provider, url: url.toString() },
    };
  }
  if (provider) {
    return { state: "unsupported", source: null, message: `${provider} extraction is not connected yet.` };
  }

  return { state: "unsupported", source: null, message: "This source is not supported yet. Use a YouTube video link." };
}

// Kept as a small compatibility alias for callers and tests from the first
// extractor prototype. Unknown links intentionally return null now.
export function detectPlatform(raw) {
  return inspectMediaLink(raw).source;
}

export function codecLabel(codec = "") {
  return CODEC_LABELS.find(([pattern]) => pattern.test(codec))?.[1] || codec.split(".")[0]?.toUpperCase() || "Unknown";
}

export function parseMimeType(mimeType = "") {
  const [mime = "application/octet-stream", ...parameters] = mimeType.split(";");
  const [type = "application", subtype = "octet-stream"] = mime.trim().split("/");
  const codecMatch = parameters.join(";").match(/codecs=["']([^"']+)["']/i);
  const codecs = codecMatch ? codecMatch[1].split(",").map((codec) => codec.trim()).filter(Boolean) : [];
  return { type, container: subtype === "x-m4a" ? "mp4" : subtype, codecs };
}

export function normalizeYouTubeFormat(format) {
  const parsed = parseMimeType(format?.mime_type);
  const durationSeconds = Number(format?.approx_duration_ms || 0) / 1000;
  const bitrate = Number(format?.average_bitrate || format?.bitrate || 0);
  const contentLength = Number(format?.content_length || 0) || (durationSeconds && bitrate ? Math.round((durationSeconds * bitrate) / 8) : 0);
  const videoCodec = parsed.codecs.find((codec) => !/mp4a|aac|opus|vorbis/i.test(codec)) || "";
  const audioCodec = parsed.codecs.find((codec) => /mp4a|aac|opus|vorbis/i.test(codec)) || (format?.has_audio && !format?.has_video ? parsed.codecs[0] || "" : "");

  return {
    id: String(format?.itag),
    itag: Number(format?.itag),
    container: parsed.container,
    mimeType: format?.mime_type || "application/octet-stream",
    codecs: parsed.codecs,
    videoCodec,
    audioCodec,
    videoCodecLabel: videoCodec ? codecLabel(videoCodec) : "",
    audioCodecLabel: audioCodec ? codecLabel(audioCodec) : "",
    hasVideo: Boolean(format?.has_video),
    hasAudio: Boolean(format?.has_audio),
    width: Number(format?.width || 0),
    height: Number(format?.height || 0),
    fps: Number(format?.fps || 0),
    bitrate,
    audioBitrate: format?.has_audio ? bitrate : 0,
    audioChannels: Number(format?.audio_channels || 0),
    audioSampleRate: Number(format?.audio_sample_rate || 0),
    language: format?.language || format?.audio_track?.display_name || "Original",
    isOriginal: format?.is_original !== false,
    isDrc: Boolean(format?.is_drc),
    bytes: contentLength,
    durationSeconds,
    raw: format,
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** power;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: power > 1 ? 1 : 0 }).format(amount)} ${units[power]}`;
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatScore(format) {
  return (format.height || 0) * 1e12 + (format.fps || 0) * 1e9 + (format.bitrate || 0);
}

function audioScore(format) {
  return (format.isOriginal ? 1e12 : 0) + (format.isDrc ? 0 : 1e11) + (format.bitrate || 0);
}

export function sortVideoFormats(formats) {
  return [...formats].sort((a, b) => formatScore(b) - formatScore(a));
}

export function sortAudioFormats(formats) {
  return [...formats].sort((a, b) => audioScore(b) - audioScore(a));
}

export function availableTargets(media) {
  const formats = media?.formats || [];
  const hasMp4Video = formats.some((format) => format.hasVideo && format.container === "mp4");
  const hasWebmVideo = formats.some((format) => format.hasVideo && format.container === "webm");
  const audio = formats.filter((format) => format.hasAudio && !format.hasVideo);
  return TARGETS.filter((target) => {
    if (target.value === "mp4") return hasMp4Video;
    if (target.value === "webm") return hasWebmVideo;
    if (target.value === "m4a") return audio.some((format) => !format.raw?.derivedFromVideo && (format.container === "mp4" || format.audioCodecLabel === "AAC"));
    return target.value === "mp3" && audio.length > 0;
  });
}

function videoChoiceLabel(format) {
  const resolution = format.height ? `${format.height}p` : "Video";
  const fps = format.fps ? ` · ${format.fps} FPS` : "";
  return `${resolution}${fps} · ${format.videoCodecLabel || format.container.toUpperCase()}`;
}

function audioChoiceLabel(format) {
  const kbps = format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : "Original bitrate";
  return `${format.audioCodecLabel || format.container.toUpperCase()} · ${kbps}`;
}

export function qualityChoices(media, target) {
  const formats = media?.formats || [];
  if (["mp4", "webm"].includes(target)) {
    const seen = new Set();
    return sortVideoFormats(formats.filter((format) => format.hasVideo && format.container === target))
      .filter((format) => {
        const key = [format.height, format.fps, format.videoCodecLabel, format.hasAudio].join(":");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((format, index) => ({
        value: format.id,
        label: `${index === 0 ? "Best · " : ""}${videoChoiceLabel(format)}`,
        description: `${format.hasAudio ? "Audio included" : "Original video stream"} · ${formatBytes(format.bytes)}`,
      }));
  }

  const compatible = formats.filter((format) => {
    if (!format.hasAudio || format.hasVideo) return false;
    return target !== "m4a" || format.container === "mp4" || format.audioCodecLabel === "AAC";
  });
  const seen = new Set();
  return sortAudioFormats(compatible)
    .filter((format) => {
      const key = [format.audioCodecLabel, Math.round(format.bitrate / 1000), format.language, format.isDrc].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((format, index) => ({
      value: format.id,
      label: `${index === 0 ? "Best · " : ""}${audioChoiceLabel(format)}`,
      description: `${format.language}${format.isDrc ? " · volume balanced" : " · original track"} · ${formatBytes(format.bytes)}`,
    }));
}

export function audioChoices(media, target = "mp4") {
  const compatible = (media?.formats || []).filter((format) => {
    if (!format.hasAudio || format.hasVideo) return false;
    if (target === "mp4") return format.container === "mp4" || format.audioCodecLabel === "AAC";
    if (target === "webm") return format.container === "webm" || format.audioCodecLabel === "Opus";
    return true;
  });
  return sortAudioFormats(compatible).map((format, index) => ({
    value: format.id,
    label: `${index === 0 ? "Best · " : ""}${audioChoiceLabel(format)}`,
    description: `${format.language} · ${format.audioChannels ? `${format.audioChannels} channels` : "source channels"}`,
  }));
}

export function defaultExtractSettings(media, requestedTarget = "mp4") {
  const targets = availableTargets(media);
  const target = targets.some((option) => option.value === requestedTarget) ? requestedTarget : targets[0]?.value || "mp4";
  const qualities = qualityChoices(media, target);
  const audio = audioChoices(media, target);
  return {
    target,
    formatId: qualities[0]?.value || "",
    audioId: audio[0]?.value || "",
    includeAudio: true,
    bitrate: "320",
    channels: "original",
  };
}

export function patchTargetSettings(media, settings, target) {
  return { ...settings, ...defaultExtractSettings(media, target), target };
}

export function sourceSummary(media) {
  const video = sortVideoFormats((media?.formats || []).filter((format) => format.hasVideo))[0];
  const audio = sortAudioFormats((media?.formats || []).filter((format) => format.hasAudio && !format.hasVideo))[0];
  return {
    video: video ? `${video.height || "?"}p${video.fps ? ` · ${video.fps} FPS` : ""} · ${video.videoCodecLabel}` : "No video stream",
    audio: audio ? `${audio.audioCodecLabel} · ${audio.bitrate ? `~${Math.round(audio.bitrate / 1000)} kbps` : "source bitrate"}` : "No audio stream",
  };
}

export function outputSummary(media, settings) {
  const choice = qualityChoices(media, settings.target).find((option) => option.value === settings.formatId);
  if (settings.target === "mp3") return `MP3 · ${settings.bitrate} kbps`;
  if (settings.target === "m4a") return choice?.label.replace(/^Best · /, "") || "M4A";
  return choice?.label.replace(/^Best · /, "") || settings.target.toUpperCase();
}

export function findFormat(media, id) {
  return (media?.formats || []).find((format) => format.id === String(id));
}

export async function resolveMedia(source, options = {}) {
  if (!source) throw new Error("This source is not supported yet.");
  const resolver = await import("@/lib/youtubeResolver");
  if (source.id === "youtube") return resolver.resolveYouTube(source, options);
  if (["tiktok", "instagram", "facebook"].includes(source.id)) return resolver.resolveSocialMedia(source, options);
  throw new Error("This source is not supported yet.");
}
