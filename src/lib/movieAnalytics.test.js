import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAnalyticsId,
  mediaAnalyticsContext,
  postMovieAnalytics,
} from "@/lib/movieAnalytics";

describe("movie analytics helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates scoped, storage-safe identifiers", () => {
    expect(createAnalyticsId("s_")).toMatch(/^s_[A-Za-z0-9-]+$/);
    expect(createAnalyticsId("v_")).toMatch(/^v_[A-Za-z0-9-]+$/);
  });

  it("normalizes movie and episode context", () => {
    expect(mediaAnalyticsContext({ id: 42, title: "Example", mediaType: "movie" })).toEqual({
      mediaId: "42",
      mediaType: "movie",
      title: "Example",
      season: null,
      episode: null,
    });
    expect(mediaAnalyticsContext({ id: "tt1", title: "Series", mediaType: "tv", season: 2, episode: 5 })).toEqual({
      mediaId: "tt1",
      mediaType: "tv",
      title: "Series",
      season: 2,
      episode: 5,
    });
    expect(mediaAnalyticsContext(null)).toBeNull();
  });

  it("posts event data without credentials", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postMovieAnalytics("https://analytics.example", { eventType: "session_start" })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://analytics.example/afilm/analytics/collect", expect.objectContaining({
      method: "POST",
      credentials: "omit",
      keepalive: true,
    }));
  });
});
