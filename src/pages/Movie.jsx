import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  LoaderCircle,
  Play,
  Search,
  Star,
  Tv2,
  X,
} from "lucide-react";
import {
  buildPlayerUrl,
  FEATURED_MEDIA,
  fetchCatalogPage,
  fetchMediaDetails,
  loadMovieHistory,
  parseMediaInput,
  saveMovieHistory,
  searchMedia,
  VIDUP_ORIGIN,
  VIDUP_PROGRESS_KEY,
} from "@/lib/movie";
import { cn } from "@/lib/cn";
import { useSeo } from "@/lib/seo";
import "@/pages/movie.css";

const TYPES = [
  { id: "all", label: "Browse" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV" },
];

const iconProps = { size: 16, strokeWidth: 1.35, absoluteStrokeWidth: true, "aria-hidden": true };

function progressRatio(progress) {
  const duration = Number(progress?.duration) || 0;
  return duration > 0 ? Math.max(0, Math.min(1, (Number(progress?.watched) || 0) / duration)) : 0;
}

function sameMedia(left, right) {
  return left?.id === right?.id && left?.mediaType === right?.mediaType;
}

function savedItemFor(history, media) {
  return history.find((item) => sameMedia(item, media) || (
    item.mediaType === media.mediaType && item.title?.toLowerCase() === media.title?.toLowerCase()
  ));
}

function TypeMark({ type, compact = false }) {
  const Icon = type === "tv" ? Tv2 : Film;
  return (
    <span className={cn("movie-type-mark", compact && "movie-type-mark--compact")}>
      <Icon size={compact ? 10 : 11} strokeWidth={1.4} absoluteStrokeWidth aria-hidden="true" />
      {type === "tv" ? "Series" : "Film"}
    </span>
  );
}

function ratingVerdict(value) {
  const rating = Number(value);
  if (!rating) return "Rating pending";
  if (rating >= 8.5) return "Exceptional audience score";
  if (rating >= 7.5) return "Highly rated";
  if (rating >= 6.5) return "Positive audience score";
  return "Mixed audience score";
}

function RatingMark({ rating, compact = false, detailed = false }) {
  const score = Number(rating);
  const available = Number.isFinite(score) && score > 0;
  return (
    <span
      className={cn(
        "movie-rating-mark",
        compact && "movie-rating-mark--compact",
        detailed && "movie-rating-mark--detailed",
        !available && "is-unrated",
      )}
      aria-label={available ? `IMDb rating ${score} out of 10` : "IMDb rating unavailable"}
    >
      <Star size={compact ? 9 : 13} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <span className="movie-rating-mark__score">{available ? score.toFixed(1) : "N/R"}</span>
      <span className="movie-rating-mark__source"><b>IMDb</b>{detailed && <small>{available ? "out of 10" : "not rated"}</small>}</span>
    </span>
  );
}

function MediaImage({ media, className, priority = false, backdrop = false }) {
  const [failed, setFailed] = useState(false);
  const source = backdrop ? media.background || media.image : media.image;
  const Icon = media.mediaType === "tv" ? Tv2 : Film;
  return (
    <div className={cn("movie-image", className)}>
      {source && !failed ? (
        <img
          src={source}
          alt=""
          aria-hidden="true"
          width={backdrop ? 1920 : 720}
          height={backdrop ? 1080 : 1080}
          sizes={backdrop ? "100vw" : "(max-width: 720px) 50vw, 17vw"}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="movie-image__fallback"><Icon size={28} strokeWidth={0.9} absoluteStrokeWidth aria-hidden="true" /></div>
      )}
    </div>
  );
}

function LiquidSurface({ children, className, onPointerEnter, onPointerLeave, onPointerMove, ...props }) {
  const surfaceRef = useRef(null);
  const move = (event) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (rect) {
      surfaceRef.current.style.setProperty("--glass-active", "1");
      surfaceRef.current.style.setProperty("--glass-x", `${event.clientX - rect.left}px`);
      surfaceRef.current.style.setProperty("--glass-y", `${event.clientY - rect.top}px`);
    }
    onPointerMove?.(event);
  };
  return (
    <div
      ref={surfaceRef}
      onPointerEnter={(event) => { surfaceRef.current?.style.setProperty("--glass-active", "1"); onPointerEnter?.(event); }}
      onPointerLeave={(event) => { surfaceRef.current?.style.setProperty("--glass-active", "0"); onPointerLeave?.(event); }}
      onPointerMove={move}
      className={cn("movie-glass", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function ProgressiveEdgeBlur({ edge, hidden = false }) {
  return (
    <div className={cn("movie-edge-blur", `movie-edge-blur--${edge}`)} data-hidden={hidden ? "true" : "false"} aria-hidden="true">
      <span className="movie-edge-blur__soft" />
      <span className="movie-edge-blur__medium" />
      <span className="movie-edge-blur__strong" />
      <span className="movie-edge-blur__tint" />
    </div>
  );
}

function SecretHeader({ view, onView, onSearch, onHome, player = false }) {
  return (
    <header className="movie-header">
      <LiquidSurface className={cn("movie-header__glass", player && "movie-header__glass--player")}>
        <button type="button" onClick={onHome} className="movie-wordmark" aria-label={player ? "Return to catalog" : "Scroll to top"}>
          <span className="movie-wordmark__text movie-wordmark__text--desktop" aria-hidden="true">Augustas Films</span>
          <span className="movie-wordmark__text movie-wordmark__text--mobile" aria-hidden="true">Films</span>
        </button>
        {!player && (
          <nav aria-label="Browse" className="movie-header__nav">
            {TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => onView(type.id)}
                className={cn("movie-header__nav-item", view === type.id && "is-active")}
              >
                {type.label}
              </button>
            ))}
          </nav>
        )}
        <button type="button" onClick={onSearch} className="movie-search-trigger" aria-label="Search">
          <Search {...iconProps} />
          <span>Search</span>
          <kbd>⌘ K</kbd>
        </button>
      </LiquidSurface>
    </header>
  );
}

function Hero({ items, index, onIndex, onSelect, onExplore }) {
  const media = items[index] || items[0] || FEATURED_MEDIA[0];
  const heroItems = items.slice(0, 6);

  useEffect(() => {
    if (heroItems.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => onIndex((index + 1) % heroItems.length), 9000);
    return () => window.clearInterval(timer);
  }, [heroItems.length, index, onIndex]);

  return (
    <section className="movie-hero" aria-label="Featured title">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={media.id}
          initial={{ opacity: 0, scale: 1.025 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.75 }, scale: { duration: 6, ease: "linear" } }}
          className="movie-hero__art"
        >
          <MediaImage media={media} backdrop priority />
        </motion.div>
      </AnimatePresence>
      <div className="movie-hero__shade" />
      <div className="movie-hero__content">
        <motion.div
          key={`copy-${media.id}`}
          initial={{ opacity: 0, y: 18, filter: "blur(9px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="movie-hero__copy"
        >
          <div className="movie-hero__eyebrow"><TypeMark type={media.mediaType} /> <span>Popular now</span></div>
          <h1>{media.title}</h1>
          <div className="movie-meta-line">
            {media.year && <span>{media.year}</span>}
            {media.runtime && <span>{media.runtime}</span>}
            {media.rating && <span>IMDb {media.rating}</span>}
            {(media.genres || []).slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
          </div>
          {media.detail && <p>{media.detail}</p>}
          <div className="movie-hero__actions">
            <button type="button" onClick={() => onSelect(media)} className="movie-primary-button">
              <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
              Watch now
            </button>
            <button type="button" onClick={onExplore} className="movie-secondary-button">
              Explore catalog
              <ArrowDown size={14} strokeWidth={1.4} absoluteStrokeWidth aria-hidden="true" />
            </button>
          </div>
        </motion.div>

        <div className="movie-hero__rail" aria-label="Featured titles">
          {heroItems.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onIndex(itemIndex)}
              className={cn("movie-hero__rail-item", itemIndex === index && "is-active")}
              aria-label={`Feature ${item.title}`}
            >
              <span>{String(itemIndex + 1).padStart(2, "0")}</span>
              <i />
            </button>
          ))}
        </div>
      </div>
      <div className="movie-hero__edge-glass" aria-hidden="true" />
    </section>
  );
}

function PosterCard({ media, index, progress, onSelect }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [7, -7]), { stiffness: 190, damping: 24 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-7, 7]), { stiffness: 190, damping: 24 });
  const watched = progressRatio(progress);

  const move = (event) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
    event.currentTarget.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
  };

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ delay: Math.min((index % 6) * 0.045, 0.22), duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      onPointerMove={move}
      onPointerLeave={(event) => {
        x.set(0);
        y.set(0);
        event.currentTarget.style.removeProperty("--card-x");
        event.currentTarget.style.removeProperty("--card-y");
      }}
      onPointerCancel={() => { x.set(0); y.set(0); }}
      onClick={() => onSelect(media)}
      className="movie-poster-card"
      style={{ rotateX, rotateY, transformPerspective: 900 }}
    >
      <div className="movie-poster-card__clip">
        <div className="movie-poster-card__art">
          <MediaImage media={media} />
          <div className="movie-poster-card__shade" />
          <div className="movie-poster-card__specular" />
          <div className="movie-poster-card__top"><TypeMark type={media.mediaType} compact /></div>
          <div className="movie-poster-card__rating"><RatingMark rating={media.rating} compact /></div>
          <div className="movie-poster-card__hover">
            <span className="movie-poster-card__play"><Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" /></span>
            <span>Open {media.mediaType === "tv" ? "series" : "film"}</span>
          </div>
          {watched > 0 && <div className="movie-poster-card__progress"><i style={{ width: `${watched * 100}%` }} /></div>}
        </div>
      </div>
      <div className="movie-poster-card__copy">
        <h3>{media.title}</h3>
        <p>{[media.year, media.mediaType === "tv" ? "Series" : media.runtime, media.rating ? `IMDb ${media.rating}` : "Not rated"].filter(Boolean).join(" · ")}</p>
      </div>
    </motion.button>
  );
}

function CatalogSkeleton() {
  return Array.from({ length: 12 }, (_, index) => (
    <div key={index} className="movie-skeleton"><div /><span /><i /></div>
  ));
}

function SearchOverlay({ open, catalog, active, onClose, onSelect }) {
  const lenis = useLenis();
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!open) { lenis?.start(); return undefined; }
    lenis?.stop();
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", escape);
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      lenis?.start();
    };
  }, [lenis, onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    const term = query.trim();
    if (term.length < 2 && !parseMediaInput(term, type)) { setResults([]); setStatus("idle"); return undefined; }
    const controller = new AbortController();
    setResults([]);
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchMedia(term, { signal: controller.signal, mediaType: type });
        setResults(found); setStatus(found.length ? "ready" : "empty");
      } catch (error) { if (error?.name !== "AbortError") setStatus("error"); }
    }, parseMediaInput(term, type) ? 0 : 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, type]);

  const shown = query.trim() ? results : catalog.slice(0, 10);
  const highlightedIndex = Math.min(highlighted, Math.max(0, shown.length - 1));
  const choose = (media) => { onSelect(media); setQuery(""); onClose(); };
  useEffect(() => setHighlighted(0), [query, type, open]);
  useEffect(() => {
    resultsRef.current?.querySelector(`[data-result-index="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="movie-search-overlay" data-lenis-prevent>
          <button type="button" aria-label="Close search" onClick={onClose} className="movie-search-overlay__backdrop" />
          <motion.div role="dialog" aria-modal="true" aria-label="Search the catalog" initial={{ opacity: 0, y: -22, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.99 }} transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }} className="movie-search-overlay__panel movie-glass">
            <div className="movie-search-overlay__head"><p><span>Augustas Films</span> Find a title</p><button type="button" onClick={onClose} aria-label="Close search"><X {...iconProps} /></button></div>
            <form
              onSubmit={(event) => { event.preventDefault(); if (shown[highlightedIndex]) choose(shown[highlightedIndex]); }}
              onKeyDown={(event) => {
                if (!shown.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
                event.preventDefault();
                setHighlighted((current) => event.key === "ArrowDown" ? (current + 1) % shown.length : (current - 1 + shown.length) % shown.length);
              }}
              className="movie-search-field"
            >
              {status === "loading" ? <LoaderCircle {...iconProps} className="animate-spin" /> : <Search {...iconProps} />}
              <input
                ref={inputRef}
                name="movie-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles or paste an ID…"
                aria-label="Search movies, series, IMDb or TMDB"
                autoComplete="off"
                spellCheck="false"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} strokeWidth={1.4} absoluteStrokeWidth /></button>}
              <button type="submit" disabled={!shown.length} aria-label="Open first result"><ArrowRight {...iconProps} /></button>
            </form>
            <div className="movie-search-scopes">
              {TYPES.map((option) => <button key={option.id} type="button" onClick={() => setType(option.id)} className={cn(type === option.id && "is-active")}>{option.label}</button>)}
              <span><kbd>↑↓</kbd> Browse <kbd>↵</kbd> Open <kbd>Esc</kbd> Close</span>
            </div>
            <div className="movie-search-overlay__label"><span>{query ? "Top results" : "Popular searches"}</span><small aria-live="polite">{status === "ready" ? `${results.length} matches` : "IMDb / TMDB IDs accepted"}</small></div>
            <div ref={resultsRef} className="movie-search-results">
              {status === "loading" && Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="movie-search-result movie-search-result--skeleton" aria-hidden="true">
                  <span className="movie-search-result__skeleton-art" />
                  <div><i /><i /><i /></div>
                </div>
              ))}
              {shown.map((media, index) => (
                <button key={`${media.mediaType}-${media.id}`} type="button" data-result-index={index} onMouseEnter={() => setHighlighted(index)} onFocus={() => setHighlighted(index)} onClick={() => choose(media)} className={cn("movie-search-result", index === highlightedIndex && "is-highlighted")}>
                  <MediaImage media={media} priority={index < 4} />
                  <div><TypeMark type={media.mediaType} compact /><h3>{media.title}</h3><p>{[media.year, media.runtime, media.rating ? `IMDb ${media.rating}` : ""].filter(Boolean).join(" · ")}</p></div>
                  {sameMedia(active, media) ? <Check {...iconProps} /> : <ChevronRight {...iconProps} />}
                </button>
              ))}
              {status === "empty" && <div className="movie-search-empty"><Search size={24} strokeWidth={1} /><p>No matching title found.</p><span>Try the exact title or paste an IMDb / TMDB ID.</span></div>}
              {status === "error" && <div className="movie-search-empty"><p>Search is temporarily unavailable.</p><span>Direct IMDb and TMDB IDs still work.</span></div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EpisodeShelf({ media, details, onEpisode }) {
  const allSeasons = useMemo(() => [...new Set((details.episodes || []).map((item) => item.season))].filter((season) => season > 0).sort((a, b) => a - b), [details.episodes]);
  const [season, setSeason] = useState(media.season || allSeasons[0] || 1);
  useEffect(() => setSeason(media.season || allSeasons[0] || 1), [allSeasons, media.season]);
  const episodes = (details.episodes || []).filter((item) => item.season === season);
  const currentIndex = episodes.findIndex((item) => item.episode === (media.episode || 1));
  const previous = episodes[currentIndex - 1];
  const next = episodes[currentIndex + 1];

  return (
    <section className="movie-episodes">
      <div className="movie-section-heading">
        <div><p>Episode guide</p><h2>Season {String(season).padStart(2, "0")}</h2></div>
        <div className="movie-season-nav">
          {allSeasons.length ? allSeasons.map((number) => <button key={number} type="button" onClick={() => setSeason(number)} className={cn(number === season && "is-active")}>{String(number).padStart(2, "0")}</button>) : (
            <><button type="button" aria-label="Previous season" onClick={() => setSeason(Math.max(1, season - 1))}><ChevronLeft {...iconProps} /></button><span>Season {season}</span><button type="button" aria-label="Next season" onClick={() => setSeason(season + 1)}><ChevronRight {...iconProps} /></button></>
          )}
        </div>
      </div>
      {episodes.length ? (
        <div className="movie-episode-rail" data-lenis-prevent>
          {episodes.map((episode) => {
            const selected = episode.episode === (media.episode || 1) && episode.season === (media.season || 1);
            return (
              <button key={episode.id} type="button" onClick={() => onEpisode(episode)} className={cn("movie-episode", selected && "is-active")}>
                <div className="movie-episode__art">{episode.image ? <img src={episode.image} alt="" width="640" height="348" loading="lazy" /> : <span>E{String(episode.episode).padStart(2, "0")}</span>}<i><Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" /></i></div>
                <div className="movie-episode__copy"><span>Episode {String(episode.episode).padStart(2, "0")}</span><h3>{episode.title}</h3><p>{episode.description}</p></div>
              </button>
            );
          })}
        </div>
      ) : (
        <LiquidSurface className="movie-episode-fallback">
          <div><span>Season</span><strong>{String(media.season || season).padStart(2, "0")}</strong></div><div><span>Episode</span><strong>{String(media.episode || 1).padStart(2, "0")}</strong></div>
          <button type="button" disabled={(media.episode || 1) <= 1} onClick={() => onEpisode({ season, episode: Math.max(1, (media.episode || 1) - 1) })}><ChevronLeft {...iconProps} /> Previous</button>
          <button type="button" onClick={() => onEpisode({ season, episode: (media.episode || 1) + 1 })}>Next <ChevronRight {...iconProps} /></button>
        </LiquidSurface>
      )}
      {episodes.length > 0 && <div className="movie-episode-stepper"><button type="button" disabled={!previous} onClick={() => previous && onEpisode(previous)}><ChevronLeft {...iconProps} /> Previous episode</button><span>{currentIndex >= 0 ? `${currentIndex + 1} of ${episodes.length}` : `${episodes.length} episodes`}</span><button type="button" disabled={!next} onClick={() => next && onEpisode(next)}>Next episode <ChevronRight {...iconProps} /></button></div>}
    </section>
  );
}

function PlayerPage({ media, catalog, history, searchOpen, onSelect, onClose, onSearch, onHistory }) {
  const [details, setDetails] = useState({ ...media, episodes: [] });
  const lastWrite = useRef(0);
  const playerFrameRef = useRef(null);
  const playerShellRef = useRef(null);
  const playerUrl = useMemo(() => buildPlayerUrl(media, {
    autoPlay: false,
    chromecast: true,
    hideServer: false,
    poster: true,
    theme: "FFFFFF",
  }), [media.episode, media.id, media.mediaType, media.season]);

  useEffect(() => { const controller = new AbortController(); fetchMediaDetails(media, { signal: controller.signal }).then(setDetails).catch(() => {}); return () => controller.abort(); }, [media.id, media.mediaType]);
  useEffect(() => {
    const receive = ({ origin, data, source }) => {
      if (origin !== VIDUP_ORIGIN || !data) return;
      if (source !== playerFrameRef.current?.contentWindow) return;
      if (data.type === "MEDIA_DATA") { window.localStorage.setItem(VIDUP_PROGRESS_KEY, JSON.stringify(data.data)); return; }
      if (data.type !== "PLAYER_EVENT" || !data.data) return;
      const currentTime = Math.max(0, Number(data.data.currentTime) || 0); const duration = Math.max(0, Number(data.data.duration) || 0);
      const nextStatus = {
        currentTime,
        duration,
        muted: Boolean(data.data.muted),
        playing: Boolean(data.data.playing),
        volume: Math.max(0, Math.min(1, Number(data.data.volume) || 0)),
      };
      if (playerShellRef.current) {
        playerShellRef.current.dataset.currentTime = String(nextStatus.currentTime);
        playerShellRef.current.dataset.duration = String(nextStatus.duration);
        playerShellRef.current.dataset.muted = String(nextStatus.muted);
        playerShellRef.current.dataset.playing = String(nextStatus.playing);
        playerShellRef.current.dataset.volume = String(nextStatus.volume);
      }
      const now = Date.now(); if (data.data.event === "timeupdate" && now - lastWrite.current < 1300) return; lastWrite.current = now;
      onHistory(saveMovieHistory({ ...media, ...details, progress: { watched: currentTime, duration } }));
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [details, media, onHistory]);
  const forcePlayerFocus = useCallback(() => {
    window.requestAnimationFrame(() => playerFrameRef.current?.focus({ preventScroll: true }));
  }, []);
  const focusPlayer = useCallback(() => {
    if (searchOpen || document.querySelector(".movie-search-overlay")) return;
    forcePlayerFocus();
  }, [forcePlayerFocus, searchOpen]);
  useEffect(() => {
    if (searchOpen) return undefined;
    const timer = window.setTimeout(focusPlayer, 360);
    return () => window.clearTimeout(timer);
  }, [focusPlayer, searchOpen]);
  const selectedEpisode = (episode) => onSelect({ ...media, ...details, season: episode.season || media.season || 1, episode: episode.episode || 1, progress: undefined });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="movie-player-page">
      <div className="movie-player-page__backdrop"><MediaImage media={details} backdrop priority /></div>
      <SecretHeader player view="all" onHome={onClose} onSearch={onSearch} />
      <main className="movie-player-main">
        <div className="movie-player-titlebar">
          <button type="button" onClick={onClose} className="movie-round-button" aria-label="Back to catalog"><ArrowLeft {...iconProps} /></button>
          <div><TypeMark type={media.mediaType} /><h1>{details.title || media.title}</h1></div>
          <div className="movie-player-titlebar__actions">
            {[details.year, details.runtime].filter(Boolean).map((item) => <span key={item}>{item}</span>)}
            <RatingMark rating={details.rating} detailed />
          </div>
        </div>
        <div className="movie-player-stage">
          <div
            ref={playerShellRef}
            className="movie-player-shell"
            onPointerEnter={focusPlayer}
          >
            <div className="movie-player-shell__screen">
              <iframe
                ref={playerFrameRef}
                src={playerUrl}
                title={`${details.title || media.title} player`}
                width="100%"
                height="100%"
                frameBorder="0"
                tabIndex={0}
                aria-keyshortcuts="Space ArrowLeft ArrowRight ArrowUp ArrowDown F M"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={focusPlayer}
              />
              <div className="movie-player-shell__reflection" aria-hidden="true" />
            </div>
          </div>
        </div>
        <section className="movie-player-about">
          <div className="movie-player-about__overview"><p>{details.detail || "Selected from the private catalog."}</p></div>
          <div className="movie-player-about__facts">
            <article className={cn("movie-rating-detail", !details.rating && "is-unrated")}>
              <div className="movie-rating-detail__heading"><span>IMDb audience rating</span><small>{ratingVerdict(details.rating)}</small></div>
              <div className="movie-rating-detail__score"><strong>{details.rating ? Number(details.rating).toFixed(1) : "N/R"}</strong>{details.rating && <span>/ 10</span>}</div>
              <div className="movie-rating-detail__track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, Number(details.rating) * 10 || 0))}%` }} /></div>
              <p>{details.rating ? `Catalog metadata reports an IMDb score of ${Number(details.rating).toFixed(1)}.` : "No IMDb score is available for this title yet."}</p>
            </article>
            <dl>{details.director && <div><dt>Director</dt><dd>{details.director}</dd></div>}{details.cast?.length > 0 && <div><dt>Cast</dt><dd>{details.cast.slice(0, 4).join(", ")}</dd></div>}{details.genres?.length > 0 && <div><dt>Genres</dt><dd>{details.genres.slice(0, 4).join(", ")}</dd></div>}{details.year && <div><dt>Released</dt><dd>{details.year}</dd></div>}</dl>
          </div>
        </section>
        {details.trailer?.id && (
          <section className="movie-trailer">
            <div className="movie-section-heading"><div><p>Official preview</p><h2>Watch the trailer</h2></div><span>YouTube</span></div>
            <div className="movie-trailer__frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(details.trailer.id)}?rel=0&modestbranding=1`}
                title={`${details.title || media.title} trailer`}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>
        )}
        {media.mediaType === "tv" && <EpisodeShelf media={media} details={details} onEpisode={selectedEpisode} />}
        <section className="movie-more"><div className="movie-section-heading"><div><p>Keep watching</p><h2>{media.mediaType === "tv" ? "More series" : "More films"}</h2></div></div><div className="movie-catalog-grid movie-catalog-grid--compact">{catalog.filter((item) => item.mediaType === media.mediaType && !sameMedia(item, media)).slice(0, 6).map((item, index) => <PosterCard key={item.id} media={item} index={index} progress={savedItemFor(history, item)?.progress} onSelect={onSelect} />)}</div></section>
      </main>
    </motion.div>
  );
}

function MovieExperience() {
  const lenis = useLenis();
  const [catalog, setCatalog] = useState(FEATURED_MEDIA);
  const [catalogStatus, setCatalogStatus] = useState("loading");
  const [view, setView] = useState("all");
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState(loadMovieHistory);
  const [heroIndex, setHeroIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMore = useRef(false);
  const sentinelRef = useRef(null);
  const footerRef = useRef(null);
  const [footerInView, setFooterInView] = useState(false);

  useEffect(() => {
    const controller = new AbortController(); setCatalogStatus("loading");
    fetchCatalogPage({ page: 0, pageSize: 24, signal: controller.signal }).then((items) => { if (items.length) setCatalog(items); setCatalogStatus("ready"); }).catch((error) => { if (error?.name !== "AbortError") setCatalogStatus("fallback"); });
    return () => controller.abort();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || !hasMore) return; loadingMore.current = true; setCatalogStatus("more"); const nextPage = page + 1;
    try {
      const items = await fetchCatalogPage({ page: nextPage, pageSize: 24 });
      setCatalog((current) => { const seen = new Set(current.map((item) => `${item.mediaType}:${item.id}`)); return [...current, ...items.filter((item) => !seen.has(`${item.mediaType}:${item.id}`))]; });
      setPage(nextPage); if (items.length < 12) setHasMore(false); setCatalogStatus("ready");
    } catch { setCatalogStatus("fallback"); } finally { loadingMore.current = false; }
  }, [hasMore, page]);

  useEffect(() => { const sentinel = sentinelRef.current; if (!sentinel) return undefined; const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadMore(); }, { rootMargin: "500px 0px" }); observer.observe(sentinel); return () => observer.disconnect(); }, [loadMore]);
  useEffect(() => { const footer = footerRef.current; if (!footer) return undefined; const observer = new IntersectionObserver(([entry]) => setFooterInView(entry.isIntersecting), { threshold: 0.02 }); observer.observe(footer); return () => observer.disconnect(); }, [active]);
  useEffect(() => { const shortcut = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const settle = window.setTimeout(() => {
      lenis?.scrollTo(0, { immediate: true, force: true });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 450);
    return () => window.clearTimeout(settle);
  }, [active?.id, active?.mediaType, active?.season, active?.episode, lenis]);

  const visibleCatalog = view === "all" ? catalog : catalog.filter((item) => item.mediaType === view);
  const heroItems = visibleCatalog.length ? visibleCatalog : catalog;
  const select = (media) => {
    const saved = savedItemFor(history, media); const sameEpisode = media.mediaType !== "tv" || (saved?.season === (media.season || 1) && saved?.episode === (media.episode || 1));
    const next = { ...saved, ...media, season: media.mediaType === "tv" ? media.season || saved?.season || 1 : undefined, episode: media.mediaType === "tv" ? media.episode || saved?.episode || 1 : undefined, progress: sameEpisode ? media.progress || saved?.progress : media.progress };
    setActive(next); setHistory(saveMovieHistory(next));
  };
  const changeView = (nextView) => { setView(nextView); setHeroIndex(0); lenis?.scrollTo("#catalog", { offset: -110, duration: 1.1 }); };
  const goHome = () => { if (active) setActive(null); else lenis?.scrollTo(0, { duration: 1.1 }); };

  return (
    <section className="movie-page">
      <ProgressiveEdgeBlur edge="top" />
      <ProgressiveEdgeBlur edge="bottom" hidden={!active && footerInView} />
      <AnimatePresence mode="wait">
        {active ? (
          <PlayerPage key={`${active.mediaType}-${active.id}`} media={active} catalog={catalog} history={history} searchOpen={searchOpen} onSelect={select} onClose={() => setActive(null)} onSearch={() => setSearchOpen(true)} onHistory={setHistory} />
        ) : (
          <motion.div key="catalog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SecretHeader view={view} onView={changeView} onSearch={() => setSearchOpen(true)} onHome={goHome} />
            <Hero items={heroItems} index={Math.min(heroIndex, Math.max(0, heroItems.slice(0, 6).length - 1))} onIndex={setHeroIndex} onSelect={select} onExplore={() => lenis?.scrollTo("#catalog", { offset: -90, duration: 1.2 })} />
            <main id="catalog" className="movie-catalog">
              <div className="movie-section-heading movie-catalog__heading"><div><p>Curated live</p><h2>{view === "movie" ? "Popular films" : view === "tv" ? "Popular series" : "Now showing"}</h2></div><div className="movie-catalog__count"><span>{visibleCatalog.length} titles</span><i /></div></div>
              <div className="movie-catalog-grid">{catalogStatus === "loading" ? <CatalogSkeleton /> : visibleCatalog.map((media, index) => <PosterCard key={`${media.mediaType}-${media.id}`} media={media} index={index} progress={savedItemFor(history, media)?.progress} onSelect={select} />)}</div>
              <div ref={sentinelRef} className="movie-catalog-sentinel">{hasMore ? <button type="button" onClick={loadMore} disabled={catalogStatus === "more"}>{catalogStatus === "more" ? <LoaderCircle {...iconProps} className="animate-spin" /> : <ArrowDown {...iconProps} />}{catalogStatus === "more" ? "Loading titles" : "Load more"}</button> : <span>You reached the end of the room.</span>}</div>
            </main>
            <footer ref={footerRef} className="movie-footer"><span>Augustas Films</span><p>Availability is provided by the selected embed service. Only play media you are authorized to access.</p><span>Local progress · No account</span></footer>
          </motion.div>
        )}
      </AnimatePresence>
      <SearchOverlay open={searchOpen} catalog={catalog} active={active} onClose={() => setSearchOpen(false)} onSelect={select} />
    </section>
  );
}

export default function Movie() {
  useSeo({ title: "Augustas Films", description: "A private movie and series search with direct player access and progress stored on this device.", path: "/movie", robots: "noindex, nofollow, noarchive, nosnippet, noimageindex" });
  return <ReactLenis root options={{ autoRaf: true, duration: 1.08, smoothWheel: true, wheelMultiplier: 0.86, touchMultiplier: 1.2 }}><MovieExperience /></ReactLenis>;
}
