// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  compressionTargetBytes,
  defaultCompressionSettings,
  estimateCompressedBytes,
  isCompressibleMedia,
  planVideoCompression,
} from "@/lib/compress";

function mediaFile(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("media compression planning", () => {
  it("accepts media and rejects unrelated files", () => {
    expect(isCompressibleMedia(mediaFile("photo.png", "image/png", 10))).toBe(true);
    expect(isCompressibleMedia(mediaFile("clip.mp4", "video/mp4", 10))).toBe(true);
    expect(isCompressibleMedia(mediaFile("song.mp3", "audio/mpeg", 10))).toBe(true);
    expect(isCompressibleMedia(mediaFile("notes.pdf", "application/pdf", 10))).toBe(false);
  });

  it("supports exact MB and percentage targets", () => {
    const file = mediaFile("clip.mp4", "video/mp4", 20 * 1024 * 1024);
    expect(compressionTargetBytes(file, { mode: "size", mb: 10 })).toBe(10 * 1024 * 1024);
    expect(compressionTargetBytes(file, { mode: "percent", percent: 50 })).toBe(10 * 1024 * 1024);
  });

  it("allocates target budget across video and audio", () => {
    const file = mediaFile("clip.mp4", "video/mp4", 100 * 1024 * 1024);
    const plan = planVideoCompression(file, { duration: 60, width: 1920, height: 1080 }, { mode: "size", mb: 10, settings: defaultCompressionSettings() });
    expect(plan.videoKbps).toBeGreaterThan(1000);
    expect(plan.audioKbps).toBeGreaterThanOrEqual(48);
    expect(plan.height).toBeLessThanOrEqual(1080);
    expect(plan.targetBytes).toBe(10 * 1024 * 1024);
  });

  it("lets advanced settings drive a live video estimate", () => {
    const file = mediaFile("clip.mp4", "video/mp4", 100 * 1024 * 1024);
    const meta = { duration: 60, width: 3840, height: 2160 };
    const settings = { ...defaultCompressionSettings(), videoBitrate: 1200, videoAudioBitrate: 96 };
    const estimate = estimateCompressedBytes(file, meta, settings, false, { mode: "size", mb: 10 });
    expect(estimate).toBe(Math.round(((1200 + 96) * 1000 * 60) / 8));
  });

  it("reduces image estimates when dimensions and quality are lowered", () => {
    const file = mediaFile("photo.jpg", "image/jpeg", 12 * 1024 * 1024);
    const meta = { width: 4000, height: 3000 };
    const large = estimateCompressedBytes(file, meta, { ...defaultCompressionSettings(), imageFormat: "jpg", imageDimension: "original", imageQuality: 95 }, false);
    const small = estimateCompressedBytes(file, meta, { ...defaultCompressionSettings(), imageFormat: "webp", imageDimension: "1280", imageQuality: 60 }, false);
    expect(small).toBeLessThan(large);
  });
});
