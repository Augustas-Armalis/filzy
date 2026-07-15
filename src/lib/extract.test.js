import { describe, expect, it } from "vitest";
import {
  availableTargets,
  defaultExtractSettings,
  inspectMediaLink,
  normalizeYouTubeFormat,
  qualityChoices,
  sourceSummary,
} from "@/lib/extract";

function format(data) {
  return normalizeYouTubeFormat({
    itag: data.itag,
    mime_type: data.mime,
    has_video: data.video,
    has_audio: data.audio,
    height: data.height,
    fps: data.fps,
    bitrate: data.bitrate,
    content_length: data.bytes,
    approx_duration_ms: 60_000,
    is_original: true,
  });
}

const media = {
  formats: [
    format({ itag: 401, mime: 'video/mp4; codecs="av01.0.12M.08"', video: true, audio: false, height: 2160, fps: 30, bitrate: 8_000_000, bytes: 60_000_000 }),
    format({ itag: 137, mime: 'video/mp4; codecs="avc1.640028"', video: true, audio: false, height: 1080, fps: 30, bitrate: 4_000_000, bytes: 30_000_000 }),
    format({ itag: 248, mime: 'video/webm; codecs="vp9"', video: true, audio: false, height: 1080, fps: 30, bitrate: 2_000_000, bytes: 15_000_000 }),
    format({ itag: 140, mime: 'audio/mp4; codecs="mp4a.40.2"', video: false, audio: true, bitrate: 129_000, bytes: 1_000_000 }),
    format({ itag: 251, mime: 'audio/webm; codecs="opus"', video: false, audio: true, bitrate: 145_000, bytes: 1_100_000 }),
  ],
};

describe("extract link inspection", () => {
  it("recognizes YouTube watch, short, and short-domain URLs", () => {
    expect(inspectMediaLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ").source.videoId).toBe("dQw4w9WgXcQ");
    expect(inspectMediaLink("https://youtube.com/shorts/dQw4w9WgXcQ").state).toBe("supported");
    expect(inspectMediaLink("https://youtu.be/dQw4w9WgXcQ?t=3").state).toBe("supported");
  });

  it("does not silently accept unconnected providers or arbitrary URLs", () => {
    expect(inspectMediaLink("https://www.instagram.com/reel/example/").state).toBe("unsupported");
    expect(inspectMediaLink("https://example.com/video").state).toBe("unsupported");
    expect(inspectMediaLink("example.com/video").state).toBe("invalid");
  });
});

describe("extract source formats", () => {
  it("normalizes real container, codec, dimensions, and size fields", () => {
    const normalized = media.formats[0];
    expect(normalized).toMatchObject({ container: "mp4", videoCodecLabel: "AV1", height: 2160, fps: 30, bytes: 60_000_000 });
  });

  it("exposes only output families present in the source", () => {
    expect(availableTargets(media).map((target) => target.value)).toEqual(["mp4", "mp3", "m4a", "webm"]);
    const withoutWebm = { formats: media.formats.filter((entry) => entry.container !== "webm") };
    expect(availableTargets(withoutWebm).map((target) => target.value)).toEqual(["mp4", "mp3", "m4a"]);
  });

  it("defaults to the highest actual quality instead of a hard-coded preset", () => {
    const choices = qualityChoices(media, "mp4");
    expect(choices[0].label).toContain("2160p");
    expect(defaultExtractSettings(media, "mp4").formatId).toBe("401");
    expect(sourceSummary(media).video).toContain("2160p");
  });
});
