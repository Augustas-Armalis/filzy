const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const CINEMETA_ORIGIN = "https://v3-cinemeta.strem.io";

export const VIDUP_ORIGIN = "https://vidup.to";
export const MOVIE_HISTORY_KEY = "filzyMovieHistory";
export const VIDUP_PROGRESS_KEY = "vidUpProgress";

function cleanYear(value) {
  const year = String(value || "").match(/\b(?:19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

function normalizeCinemetaMedia(item, fallbackType) {
  const id = item?.id || item?.imdb_id;
  if (!/^tt\d+$/.test(String(id || ""))) return null;
  const mediaType = (item.type || fallbackType) === "series" ? "tv" : "movie";
  return {
    id,
    mediaType,
    title: item.name || item.title || `${mediaType === "tv" ? "Show" : "Movie"} ${id}`,
    year: cleanYear(item.year || item.releaseInfo || item.released),
    detail: item.description || "",
    image: item.poster || "",
    background: item.background || "",
    runtime: item.runtime || "",
    rating: [item.imdbRating, item.rating].find((value) => value && value !== "N/A" && value !== "0") || "",
    ratingSource: "IMDb",
    genres: item.genres || item.genre || [],
    cast: item.cast || [],
    director: Array.isArray(item.director) ? item.director[0] : item.director || "",
    popularity: Number(item.popularity || item.popularities?.stremio) || 0,
    ...(mediaType === "tv" ? { season: 1, episode: 1 } : {}),
  };
}

function interleave(left, right, limit = Infinity) {
  const combined = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length && combined.length < limit; index += 1) {
    if (left[index]) combined.push(left[index]);
    if (right[index] && combined.length < limit) combined.push(right[index]);
  }
  return combined;
}

async function fetchCinemeta(path, signal) {
  const response = await fetch(`${CINEMETA_ORIGIN}${path}`, { signal });
  if (!response.ok) throw new Error("The live catalog is unavailable right now.");
  const data = await response.json();
  return Array.isArray(data) ? data : data.metas || [];
}

export async function fetchCatalogPage({ page = 0, pageSize = 24, signal } = {}) {
  const perType = Math.max(6, Math.ceil(pageSize / 2));
  const skip = Math.max(0, page) * perType;
  const suffix = skip > 0 ? `/skip=${skip}.json` : ".json";
  const [movies, series] = await Promise.all([
    fetchCinemeta(`/catalog/movie/top${suffix}`, signal),
    fetchCinemeta(`/catalog/series/top${suffix}`, signal),
  ]);
  const catalog = interleave(
    movies.map((item) => normalizeCinemetaMedia(item, "movie")).filter(Boolean).slice(0, perType),
    series.map((item) => normalizeCinemetaMedia(item, "series")).filter(Boolean).slice(0, perType),
    pageSize,
  );
  return Promise.all(catalog.map(async (media) => {
    if (media.rating) return media;
    try {
      const details = await fetchMediaDetails(media, { signal });
      return details.rating ? { ...media, rating: details.rating, ratingSource: "IMDb" } : media;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return media;
    }
  }));
}

export async function fetchMediaDetails(media, { signal } = {}) {
  if (!media?.id || !/^tt\d+$/.test(String(media.id))) return { ...media, episodes: [], trailer: null };
  const type = media.mediaType === "tv" ? "series" : "movie";
  const response = await fetch(`${CINEMETA_ORIGIN}/meta/${type}/${encodeURIComponent(media.id)}.json`, { signal });
  if (!response.ok) return { ...media, episodes: [], trailer: null };
  const data = await response.json();
  const meta = data.meta || data;
  const details = normalizeCinemetaMedia(meta, type) || media;
  const episodes = (meta.videos || []).map((episode) => ({
    id: episode.id,
    season: Math.max(0, Number(episode.season) || 0),
    episode: Math.max(1, Number(episode.episode || episode.number) || 1),
    title: episode.name || `Episode ${episode.episode || episode.number || 1}`,
    description: episode.overview || episode.description || "",
    image: episode.thumbnail || "",
    released: episode.released || episode.firstAired || "",
    rating: episode.rating && episode.rating !== "0" ? episode.rating : "",
  }));
  const trailerStream = (meta.trailerStreams || []).find((item) => /^[\w-]{6,}$/.test(String(item?.ytId || "")));
  const trailerFallback = (meta.trailers || []).find((item) => /^[\w-]{6,}$/.test(String(item?.source || "")));
  const trailerId = trailerStream?.ytId || trailerFallback?.source || "";
  const trailer = trailerId ? {
    id: trailerId,
    title: trailerStream?.title || `${details.title || media.title} trailer`,
  } : null;
  return { ...media, ...details, season: media.season || 1, episode: media.episode || 1, episodes, trailer };
}

export const FEATURED_MEDIA = [
  {
    id: "tt1375666",
    mediaType: "movie",
    title: "Inception",
    year: 2010,
    detail: "A dream shared is a world built.",
    image: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg",
  },
  {
    id: "tt0816692",
    mediaType: "movie",
    title: "Interstellar",
    year: 2014,
    detail: "Beyond time. Beyond the familiar.",
    image: "https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_.jpg",
  },
  {
    id: "tt2543164",
    mediaType: "movie",
    title: "Arrival",
    year: 2016,
    detail: "Language changes the shape of time.",
    image: "https://m.media-amazon.com/images/M/MV5BMTExMzU0ODcxNDheQTJeQWpwZ15BbWU4MDE1OTI4MzAy._V1_.jpg",
  },
  {
    id: "tt1856101",
    mediaType: "movie",
    title: "Blade Runner 2049",
    year: 2017,
    detail: "The future remembers everything.",
    image: "https://m.media-amazon.com/images/M/MV5BNzA1Njg4NzYxOV5BMl5BanBnXkFtZTgwODk5NjU3MzI@._V1_.jpg",
  },
  {
    id: "tt7660850",
    mediaType: "tv",
    title: "Succession",
    year: 2018,
    detail: "Family is the sharpest business.",
    image: "https://m.media-amazon.com/images/M/MV5BYTY4YTVkY2QtMjRmOS00YzliLWIxOWQtMTdkOTVkN2UzODNmXkEyXkFqcGc@._V1_.jpg",
    season: 1,
    episode: 1,
  },
  {
    id: "tt14452776",
    mediaType: "tv",
    title: "The Bear",
    year: 2022,
    detail: "Every second counts.",
    image: "https://m.media-amazon.com/images/M/MV5BMjk2NWI5OTctODcwYy00NGRmLWFmN2YtOTZiNzFiYjVlODBkXkEyXkFqcGc@._V1_.jpg",
    season: 1,
    episode: 1,
  },
  {
    id: "tt11280740",
    mediaType: "tv",
    title: "Severance",
    year: 2022,
    detail: "Your work self is waiting.",
    image: "https://m.media-amazon.com/images/M/MV5BZDI5YzJhODQtMzQyNy00YWNmLWIxMjUtNDBjNjA5YWRjMzExXkEyXkFqcGc@._V1_.jpg",
    season: 1,
    episode: 1,
  },
  {
    id: "tt5753856",
    mediaType: "tv",
    title: "Dark",
    year: 2017,
    detail: "Everything is connected.",
    image: "https://m.media-amazon.com/images/M/MV5BMTUzNjQ2MTY5NV5BMl5BanBnXkFtZTgwOTAzNTQxNDM@._V1_.jpg",
    season: 1,
    episode: 1,
  },
];

function numericPart(claim) {
  const value = claim?.mainsnak?.datavalue?.value;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function claimValue(entity, property) {
  return numericPart(entity?.claims?.[property]?.[0]);
}

function yearFrom(entity, description = "") {
  const time = entity?.claims?.P577?.[0]?.mainsnak?.datavalue?.value?.time;
  const timeYear = typeof time === "string" ? Number(time.match(/[+-](\d{4})/)?.[1]) : 0;
  if (timeYear) return timeYear;
  const descriptionYear = Number(description.match(/\b(19|20)\d{2}\b/)?.[0]);
  return descriptionYear || null;
}

function isTvDescription(description = "") {
  return /\b(?:television|tv|web|anime)\b.*\bseries\b|\bminiseries\b|\btelenovela\b/i.test(description);
}

function isPlayableDescription(description = "") {
  if (/soundtrack|album|novel|video game|film series|franchise|character|episode of|pornographic|adult film/i.test(description)) return false;
  return /\bfilm\b|\bmovie\b|\btelevision series\b|\btv series\b|\bweb series\b|\bminiseries\b|\btelenovela\b/i.test(description);
}

function commonsImage(filename) {
  if (!filename) return "";
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=720`;
}

export function parseMediaInput(value, preferredType = "movie") {
  const input = String(value || "").trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    if (url.hostname === "vidup.to" || url.hostname === "www.vidup.to") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "movie" && /^(?:tt\d+|\d+)$/.test(parts[1] || "")) {
        return { id: parts[1], mediaType: "movie", title: `Movie ${parts[1]}` };
      }
      if (parts[0] === "tv" && /^(?:tt\d+|\d+)$/.test(parts[1] || "")) {
        return {
          id: parts[1],
          mediaType: "tv",
          title: `Show ${parts[1]}`,
          season: Math.max(1, Number(parts[2]) || 1),
          episode: Math.max(1, Number(parts[3]) || 1),
        };
      }
    }
  } catch {
    // Plain titles and identifiers are expected to fail URL parsing.
  }

  if (!/^(?:tt\d+|\d+)$/.test(input)) return null;
  const mediaType = preferredType === "tv" ? "tv" : "movie";
  return {
    id: input,
    mediaType,
    title: `${mediaType === "tv" ? "Show" : "Movie"} ${input}`,
    ...(mediaType === "tv" ? { season: 1, episode: 1 } : {}),
  };
}

export function buildPlayerUrl(media, options = {}) {
  if (!media?.id) return "";
  const mediaType = media.mediaType === "tv" ? "tv" : "movie";
  const path = mediaType === "tv"
    ? `/tv/${encodeURIComponent(media.id)}/${Math.max(1, Number(media.season) || 1)}/${Math.max(1, Number(media.episode) || 1)}`
    : `/movie/${encodeURIComponent(media.id)}`;
  const params = new URLSearchParams({
    autoPlay: options.autoPlay === false ? "false" : "true",
    title: options.title === true ? "true" : "false",
    poster: options.poster === false ? "false" : "true",
    theme: String(options.theme || "E7FF6B").replace(/^#/, ""),
  });
  const startAt = Math.max(0, Math.floor(Number(options.startAt) || 0));
  if (startAt > 0) params.set("startAt", String(startAt));
  if (options.hideServer === true) params.set("hideServer", "true");
  if (options.fullscreenButton === false) params.set("fullscreenButton", "false");
  if (options.chromecast === false) params.set("chromecast", "false");
  if (options.sub) params.set("sub", options.sub);
  return `${VIDUP_ORIGIN}${path}?${params.toString()}`;
}

async function searchWikidata(term, { signal, mediaType = "all" } = {}) {
  const searchParams = new URLSearchParams({
    action: "wbsearchentities",
    search: term,
    language: "en",
    uselang: "en",
    format: "json",
    limit: "24",
    origin: "*",
  });
  const searchResponse = await fetch(`${WIKIDATA_API}?${searchParams}`, { signal });
  if (!searchResponse.ok) throw new Error("Movie search is unavailable right now.");
  const searchData = await searchResponse.json();
  const candidates = (searchData.search || []).filter((item) => isPlayableDescription(item.description));
  if (!candidates.length) return [];

  const entityParams = new URLSearchParams({
    action: "wbgetentities",
    ids: candidates.map((item) => item.id).join("|"),
    props: "claims|labels|descriptions",
    languages: "en",
    format: "json",
    origin: "*",
  });
  const entityResponse = await fetch(`${WIKIDATA_API}?${entityParams}`, { signal });
  if (!entityResponse.ok) throw new Error("Movie details could not be loaded.");
  const entityData = await entityResponse.json();

  return candidates.flatMap((candidate) => {
    const entity = entityData.entities?.[candidate.id];
    const id = claimValue(entity, "P345");
    if (!/^tt\d+$/.test(String(id || ""))) return [];
    const resolvedType = isTvDescription(candidate.description) ? "tv" : "movie";
    if (mediaType !== "all" && mediaType !== resolvedType) return [];
    const title = entity?.labels?.en?.value || candidate.label;
    return [{
      id,
      mediaType: resolvedType,
      title,
      year: yearFrom(entity, candidate.description),
      detail: candidate.description || (resolvedType === "tv" ? "TV series" : "Movie"),
      image: commonsImage(claimValue(entity, "P18")),
      sourceId: candidate.id,
      ...(resolvedType === "tv" ? { season: 1, episode: 1 } : {}),
    }];
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 10);
}

export async function searchMedia(query, { signal, mediaType = "all" } = {}) {
  const direct = parseMediaInput(query, mediaType);
  if (direct) return [direct];

  const term = String(query || "").trim();
  if (term.length < 2) return [];

  const types = mediaType === "movie" ? ["movie"] : mediaType === "tv" ? ["series"] : ["movie", "series"];
  const encoded = encodeURIComponent(term);
  const settled = await Promise.allSettled(types.map((type) => (
    fetchCinemeta(`/catalog/${type}/top/search=${encoded}.json`, signal)
      .then((items) => items.map((item) => normalizeCinemetaMedia(item, type)).filter(Boolean).slice(0, 12))
  )));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const groups = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const results = groups.length > 1 ? interleave(groups[0], groups[1], 16) : groups[0] || [];
  if (results.length) {
    return Promise.all(results.map(async (media) => {
      if (media.rating) return media;
      try {
        const details = await fetchMediaDetails(media, { signal });
        return details.rating ? { ...media, rating: details.rating, ratingSource: "IMDb" } : media;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        return media;
      }
    }));
  }
  return searchWikidata(term, { signal, mediaType });
}

function safelyParse(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadMovieHistory() {
  if (typeof window === "undefined") return [];
  const history = safelyParse(window.localStorage.getItem(MOVIE_HISTORY_KEY), []);
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  return history.filter((item) => {
    const title = String(item?.title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const generatedTitle = /^(?:movie|show)(?:tt)?\d+$/.test(title);
    const identity = title && !generatedTitle
      ? `${item?.mediaType || "movie"}:title:${title}`
      : `${item?.mediaType || "movie"}:id:${item?.id}`;
    if (!item?.id || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function saveMovieHistory(item) {
  if (typeof window === "undefined" || !item?.id) return [];
  const current = loadMovieHistory();
  const normalizedTitle = String(item.title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const generatedTitle = /^(?:movie|show)(?:tt)?\d+$/.test(normalizedTitle);
  const identity = normalizedTitle && !generatedTitle
    ? `${item.mediaType || "movie"}:title:${normalizedTitle}`
    : `${item.mediaType || "movie"}:id:${item.id}`;
  const next = [
    { ...item, lastUpdated: Date.now() },
    ...current.filter((candidate) => {
      const title = String(candidate.title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
      const candidateGeneratedTitle = /^(?:movie|show)(?:tt)?\d+$/.test(title);
      const candidateIdentity = title && !candidateGeneratedTitle
        ? `${candidate.mediaType || "movie"}:title:${title}`
        : `${candidate.mediaType || "movie"}:id:${candidate.id}`;
      return candidateIdentity !== identity;
    }),
  ].slice(0, 12);
  window.localStorage.setItem(MOVIE_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function historyFromMediaData(data) {
  if (!data || typeof data !== "object") return [];
  const entries = data.id ? [data] : Object.values(data);
  return entries.flatMap((item) => {
    if (!item?.id || !["movie", "tv"].includes(item.type)) return [];
    const watched = Number(item.progress?.watched) || 0;
    const duration = Number(item.progress?.duration) || 0;
    return [{
      id: String(item.id),
      mediaType: item.type,
      title: item.title || `${item.type === "tv" ? "Show" : "Movie"} ${item.id}`,
      image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
      season: item.last_season_watched || 1,
      episode: item.last_episode_watched || 1,
      progress: { watched, duration },
      lastUpdated: item.last_updated || Date.now(),
    }];
  });
}

export function formatRuntime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
