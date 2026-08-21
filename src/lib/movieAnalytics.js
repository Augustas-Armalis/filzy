import { useCallback, useEffect, useRef } from "react";

export const MOVIE_ANALYTICS_VISITOR_KEY = "afilm-analytics-visitor-v1";
export const MOVIE_ANALYTICS_SESSION_KEY = "afilm-analytics-session-v1";
export const MOVIE_ANALYTICS_ADMIN_TOKEN_KEY = "afilm-admin-token-v1";
export const MOVIE_ANALYTICS_API_DEFAULT = "https://filzy-signaling.sendfilzy-cdf.workers.dev";

const HEARTBEAT_INTERVAL = 15_000;

export function resolveMovieAnalyticsApi() {
  const configured = String(import.meta.env.VITE_AFILM_ANALYTICS_API || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (import.meta.env.PROD) return MOVIE_ANALYTICS_API_DEFAULT;
  return "";
}

export function createAnalyticsId(prefix = "") {
  const id = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${id}`;
}

export function mediaAnalyticsContext(media) {
  if (!media?.id) return null;
  return {
    mediaId: String(media.id),
    mediaType: media.mediaType === "tv" ? "tv" : "movie",
    title: String(media.title || "Untitled").slice(0, 180),
    season: media.mediaType === "tv" ? Math.max(1, Number(media.season) || 1) : null,
    episode: media.mediaType === "tv" ? Math.max(1, Number(media.episode) || 1) : null,
  };
}

export function clientAnalyticsContext() {
  return {
    path: `${window.location.pathname}${window.location.search}`.slice(0, 600),
    referrer: document.referrer.slice(0, 600),
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent.slice(0, 500),
  };
}

export async function postMovieAnalytics(api, payload, { beacon = false } = {}) {
  if (!api) return false;
  const url = `${api}/afilm/analytics/collect`;
  const body = JSON.stringify(payload);
  if (beacon && typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" }));
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useMovieAnalytics(activeMedia) {
  const api = resolveMovieAnalyticsApi();
  const activeRef = useRef(activeMedia);
  const identifiersRef = useRef(null);
  const lastHeartbeatRef = useRef(Date.now());
  const startedRef = useRef(false);

  activeRef.current = activeMedia;

  const identifiers = useCallback(() => {
    if (identifiersRef.current) return identifiersRef.current;
    let visitorId = window.localStorage.getItem(MOVIE_ANALYTICS_VISITOR_KEY);
    let sessionId = window.sessionStorage.getItem(MOVIE_ANALYTICS_SESSION_KEY);
    if (!visitorId) {
      visitorId = createAnalyticsId("v_");
      window.localStorage.setItem(MOVIE_ANALYTICS_VISITOR_KEY, visitorId);
    }
    if (!sessionId) {
      sessionId = createAnalyticsId("s_");
      window.sessionStorage.setItem(MOVIE_ANALYTICS_SESSION_KEY, sessionId);
    }
    identifiersRef.current = { visitorId, sessionId };
    return identifiersRef.current;
  }, []);

  const track = useCallback((eventType, eventData = {}, options = {}) => {
    if (!api) return Promise.resolve(false);
    const now = Date.now();
    const ids = identifiers();
    return postMovieAnalytics(api, {
      ...ids,
      eventType,
      occurredAt: now,
      visible: document.visibilityState === "visible",
      focused: document.hasFocus(),
      media: mediaAnalyticsContext(activeRef.current),
      client: clientAnalyticsContext(),
      data: eventData,
    }, options);
  }, [api, identifiers]);

  useEffect(() => {
    if (!api) return undefined;
    if (!startedRef.current) {
      startedRef.current = true;
      lastHeartbeatRef.current = Date.now();
      track("session_start");
    }

    const heartbeat = () => {
      const now = Date.now();
      const elapsed = Math.min(HEARTBEAT_INTERVAL / 1000 * 2, Math.max(0, (now - lastHeartbeatRef.current) / 1000));
      lastHeartbeatRef.current = now;
      track("heartbeat", {
        activeSeconds: document.visibilityState === "visible" && document.hasFocus() ? elapsed : 0,
      });
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") track("visibility_hidden", {}, { beacon: true });
      else {
        lastHeartbeatRef.current = Date.now();
        track("visibility_visible");
      }
    };
    const finish = () => track("session_end", {}, { beacon: true });
    const interval = window.setInterval(heartbeat, HEARTBEAT_INTERVAL);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", finish);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", finish);
      finish();
    };
  }, [api, track]);

  useEffect(() => {
    if (!activeMedia?.id) return;
    track("media_open", mediaAnalyticsContext(activeMedia));
  }, [activeMedia?.episode, activeMedia?.id, activeMedia?.mediaType, activeMedia?.season, track]);

  return { api, track };
}
