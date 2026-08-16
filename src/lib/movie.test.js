import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMovieShareUrl,
  buildPlayerUrl,
  fetchMediaDetails,
  formatRuntime,
  parseMediaInput,
  parseMovieShareSearch,
  searchMedia,
} from "@/lib/movie";

afterEach(() => vi.unstubAllGlobals());

describe("movie player helpers", () => {
  it("builds a customized movie embed URL", () => {
    expect(buildPlayerUrl(
      { id: "tt1375666", mediaType: "movie" },
      { startAt: 120, theme: "#FF0000", hideServer: true },
    )).toBe("https://vidup.to/movie/tt1375666?autoPlay=true&title=false&poster=true&theme=FF0000&startAt=120&hideServer=true");
  });

  it("builds season and episode paths for TV", () => {
    expect(buildPlayerUrl({ id: "63174", mediaType: "tv", season: 2, episode: 5 }))
      .toBe("https://vidup.to/tv/63174/2/5?autoPlay=true&title=false&poster=true&theme=E7FF6B");
  });

  it("keeps native player controls available for immediate playback", () => {
    const url = buildPlayerUrl(
      { id: "tt1375666", mediaType: "movie" },
      { autoPlay: true, poster: false, theme: "#FFFFFF" },
    );
    expect(url).toBe("https://vidup.to/movie/tt1375666?autoPlay=true&title=false&poster=false&theme=FFFFFF");
    expect(url).not.toContain("fullscreenButton=false");
  });

  it("selects English captions by default when requested", () => {
    expect(buildPlayerUrl({ id: "tt1375666", mediaType: "movie" }, { sub: "en" }))
      .toContain("sub=en");
  });

  it("returns an exact curated search match immediately", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchMedia("Inception")).resolves.toEqual([
      expect.objectContaining({ id: "tt1375666", mediaType: "movie", title: "Inception" }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses identifiers and complete player URLs", () => {
    expect(parseMediaInput("tt6263850", "movie")).toMatchObject({ id: "tt6263850", mediaType: "movie" });
    expect(parseMediaInput("63174", "tv")).toMatchObject({ id: "63174", mediaType: "tv", season: 1, episode: 1 });
    expect(parseMediaInput("https://vidup.to/tv/tt4052886/3/7?autoPlay=true"))
      .toMatchObject({ id: "tt4052886", mediaType: "tv", season: 3, episode: 7 });
    expect(parseMediaInput("The Dark Knight")).toBeNull();
  });

  it("parses shareable movie and episode URLs", () => {
    expect(parseMovieShareSearch("?id=tt1375666&type=movie"))
      .toMatchObject({ id: "tt1375666", mediaType: "movie" });
    expect(parseMovieShareSearch("?id=tt4052886&type=tv&season=3&episode=7"))
      .toMatchObject({ id: "tt4052886", mediaType: "tv", season: 3, episode: 7 });
    expect(parseMovieShareSearch("?id=not-a-title&type=movie")).toBeNull();
  });

  it("builds clean share URLs and removes stale query values", () => {
    expect(buildMovieShareUrl(
      { id: "tt1375666", mediaType: "movie" },
      "https://filzy.site/movie/?v=stale#player",
    )).toBe("https://filzy.site/movie/?id=tt1375666&type=movie");
    expect(buildMovieShareUrl(
      { id: "tt4052886", mediaType: "tv", season: 3, episode: 7 },
      "https://filzy.site/movie/",
    )).toBe("https://filzy.site/movie/?id=tt4052886&type=tv&season=3&episode=7");
    expect(buildMovieShareUrl(null, "https://filzy.site/movie/?id=tt1375666&type=movie"))
      .toBe("https://filzy.site/movie/");
  });

  it("formats player durations", () => {
    expect(formatRuntime(0)).toBe("0:00");
    expect(formatRuntime(125)).toBe("2:05");
    expect(formatRuntime(7667)).toBe("2:07:47");
  });

  it("returns a YouTube trailer from Cinemeta metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: {
          id: "tt1375666",
          type: "movie",
          name: "Inception",
          trailerStreams: [{ title: "Official trailer", ytId: "cdx31ak4KbQ" }],
        },
      }),
    }));

    await expect(fetchMediaDetails({ id: "tt1375666", mediaType: "movie", title: "Inception" }))
      .resolves.toMatchObject({ trailer: { id: "cdx31ak4KbQ", title: "Official trailer" } });
  });
});
