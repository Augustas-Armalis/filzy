import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Eye,
  Film,
  Globe2,
  LogOut,
  MapPin,
  Monitor,
  Network,
  Play,
  Radio,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Signal,
  Users,
  X,
} from "lucide-react";
import {
  MOVIE_ANALYTICS_ADMIN_TOKEN_KEY,
  resolveMovieAnalyticsApi,
} from "@/lib/movieAnalytics";
import { useSeo } from "@/lib/seo";
import "@/pages/movie-admin.css";

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const preciseNumberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const timeOnlyFormat = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTime(value, fallback = "—") {
  return Number(value) ? dateTimeFormat.format(new Date(Number(value))) : fallback;
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - Number(value || 0)) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function locationLabel(session) {
  return [session.city, session.regionCode || session.region, session.country].filter(Boolean).join(", ") || "Unknown location";
}

function mediaLabel(session) {
  if (!session.currentTitle) return "Browsing the catalog";
  const episode = session.currentType === "tv" && session.currentSeason
    ? ` · S${session.currentSeason} E${session.currentEpisode || 1}`
    : "";
  return `${session.currentTitle}${episode}`;
}

function googleMapsUrl(session) {
  const latitude = Number(session?.latitude);
  const longitude = Number(session?.longitude);
  const query = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude || longitude)
    ? `${latitude},${longitude}`
    : locationLabel(session);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function referrerName(value) {
  if (!value || value === "Direct") return "Direct";
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; }
}

function eventCopy(event) {
  const labels = {
    session_start: "Entered AFilm",
    session_end: "Left AFilm",
    media_open: "Opened a title",
    media_close: "Returned to catalog",
    search_open: "Opened search",
    search_result_open: "Selected a search result",
    catalog_filter: "Changed catalog filter",
    catalog_load_more: "Loaded more titles",
    player_play: "Started playback",
    player_pause: "Paused playback",
    player_seeked: "Skipped in the player",
    player_ended: "Finished playback",
  };
  const title = event.title || event.data?.resultTitle;
  const episode = event.mediaType === "tv" && event.season ? ` · S${event.season} E${event.episode || 1}` : "";
  return {
    label: labels[event.eventType] || event.eventType?.replaceAll("_", " ") || "Activity",
    detail: title ? `${title}${episode}` : event.data?.query ? `“${event.data.query}”` : "AFilm",
  };
}

function StatCard({ icon: Icon, label, value, detail, tone = "default" }) {
  return (
    <article className={`afilm-admin-stat afilm-admin-stat--${tone}`}>
      <div><Icon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function AccessGate({ onAccess, error, loading, apiReady }) {
  const [token, setToken] = useState("");
  return (
    <main className="afilm-admin-gate">
      <section>
        <div className="afilm-admin-gate__mark"><ShieldCheck size={19} strokeWidth={1.4} aria-hidden="true" /></div>
        <p className="afilm-admin-kicker">Private operations</p>
        <h1>AFilm intelligence</h1>
        <p>Use the private Worker token to see live visitors, viewing behavior, approximate network location, and session history.</p>
        <form onSubmit={(event) => { event.preventDefault(); onAccess(token); }}>
          <label htmlFor="afilm-admin-token">Admin access token</label>
          <div><input id="afilm-admin-token" name="afilm-admin-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="current-password" spellCheck={false} placeholder="Paste private token…" /><button type="submit" disabled={!token.trim() || loading}>{loading ? <><RefreshCw className="afilm-admin-spin" size={16} aria-hidden="true" /> Opening…</> : "Open Dashboard"}</button></div>
        </form>
        {!apiReady && <p className="afilm-admin-gate__error">Set `VITE_AFILM_ANALYTICS_API` to connect this local build.</p>}
        {error && <p className="afilm-admin-gate__error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

function MapAction({ session, compact = false }) {
  return (
    <a className={compact ? "afilm-map-action afilm-map-action--compact" : "afilm-map-action"} href={googleMapsUrl(session)} target="_blank" rel="noreferrer" aria-label={`Show approximate location for ${locationLabel(session)} on Google Maps`}>
      <MapPin size={13} strokeWidth={1.6} aria-hidden="true" />{compact ? "Map" : "Open Approximate Pin"}<ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

function LiveSession({ session, onOpen }) {
  const ratio = session.duration > 0 ? Math.min(100, Math.max(0, (session.currentTime / session.duration) * 100)) : 0;
  return (
    <article className="afilm-live-row">
      <div className="afilm-live-row__presence"><i /><div><strong>{mediaLabel(session)}</strong><span>{session.playing ? "Playing now" : session.currentTitle ? "Paused" : "Active"} · {relativeTime(session.lastSeen)}</span></div></div>
      <div className="afilm-live-row__place"><MapPin size={14} aria-hidden="true" /><span>{locationLabel(session)}<small>{session.ip || "IP unavailable"} · {session.asOrganization || "Network unknown"}</small></span></div>
      <div className="afilm-live-row__device"><Monitor size={14} aria-hidden="true" /><span>{session.browser || "Unknown browser"}<small>{session.device || session.viewport || "Unknown device"} · {session.httpProtocol || "Protocol unknown"}</small></span></div>
      <div className="afilm-live-row__time"><span>{formatDuration(session.activeSeconds)}</span><small>{ratio ? `${Math.round(ratio)}% watched` : "active time"}</small></div>
      <div className="afilm-live-row__actions"><MapAction session={session} compact /><button type="button" onClick={() => onOpen(session.sessionId)}>View Profile <ChevronRight size={13} aria-hidden="true" /></button></div>
      <div className="afilm-live-row__progress" aria-label={`${Math.round(ratio)} percent watched`}><i style={{ width: `${ratio}%` }} /></div>
    </article>
  );
}

function DetailItem({ label, value, mono = false }) {
  return <div className="afilm-profile-detail"><span>{label}</span><strong className={mono ? "is-mono" : ""}>{value || "—"}</strong></div>;
}

function VisitorProfile({ profile, loading, error, onClose }) {
  const [copied, setCopied] = useState(false);
  const session = profile?.session;
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = previous; };
  }, [onClose]);
  const copyIp = async () => {
    if (!session?.ip) return;
    await navigator.clipboard.writeText(session.ip);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="afilm-profile-layer">
      <button type="button" className="afilm-profile-layer__backdrop" onClick={onClose} aria-label="Close visitor profile" />
      <aside className="afilm-profile" role="dialog" aria-modal="true" aria-labelledby="afilm-profile-title">
        <header><div><p>Visitor profile</p><h2 id="afilm-profile-title">{session ? `Visitor ${session.visitorId?.slice(-8)}` : "Loading visitor…"}</h2></div><button type="button" onClick={onClose} aria-label="Close visitor profile"><X size={18} aria-hidden="true" /></button></header>
        {loading && <div className="afilm-profile-loading" role="status" aria-live="polite"><RefreshCw className="afilm-admin-spin" size={20} aria-hidden="true" /><p>Building the session timeline…</p></div>}
        {error && <div className="afilm-profile-loading" role="alert"><CircleDot size={20} aria-hidden="true" /><p>{error}</p></div>}
        {session && !loading && (
          <div className="afilm-profile__body">
            <section className="afilm-profile-hero">
              <div className="afilm-profile-hero__status"><i className={!session.endedAt && Date.now() - session.lastSeen < 45_000 ? "is-live" : ""} /><span>{!session.endedAt && Date.now() - session.lastSeen < 45_000 ? "Online now" : session.endedAt ? `Left ${relativeTime(session.endedAt)}` : `Last seen ${relativeTime(session.lastSeen)}`}</span></div>
              <h3>{locationLabel(session)}</h3>
              <p>{session.latitude && session.longitude ? `${Number(session.latitude).toFixed(4)}, ${Number(session.longitude).toFixed(4)}` : "Coordinates unavailable"} · IP-based estimate</p>
              <div><MapAction session={session} /><button type="button" onClick={copyIp} disabled={!session.ip}><Copy size={13} aria-hidden="true" />{copied ? "Copied" : "Copy IP"}</button></div>
            </section>

            <section className="afilm-profile-kpis">
              <article><span>Active Time</span><strong>{formatDuration(session.activeSeconds)}</strong></article>
              <article><span>Signals</span><strong>{numberFormat.format(session.eventCount || 0)}</strong></article>
              <article><span>Searches</span><strong>{numberFormat.format(session.searchCount || 0)}</strong></article>
              <article><span>Playback</span><strong>{session.duration > 0 ? `${Math.round((session.currentTime / session.duration) * 100)}%` : "—"}</strong></article>
            </section>

            <section className="afilm-profile-section">
              <div className="afilm-profile-section__heading"><Network size={14} aria-hidden="true" /><h3>Network & Location</h3></div>
              <div className="afilm-profile-details">
                <DetailItem label="IP address" value={session.ip} mono />
                <DetailItem label="ISP / network" value={session.asOrganization} />
                <DetailItem label="ASN" value={session.asn ? `AS${session.asn}` : ""} mono />
                <DetailItem label="City" value={session.city} />
                <DetailItem label="Region" value={[session.region, session.regionCode].filter(Boolean).join(" · ")} />
                <DetailItem label="Postal code" value={session.postalCode} mono />
                <DetailItem label="Country / continent" value={[session.country, session.continent].filter(Boolean).join(" · ")} />
                <DetailItem label="Cloudflare edge" value={session.colo} mono />
                <DetailItem label="TCP / QUIC RTT" value={[session.clientTcpRtt && `${session.clientTcpRtt}ms TCP`, session.clientQuicRtt && `${session.clientQuicRtt}ms QUIC`].filter(Boolean).join(" · ")} />
              </div>
            </section>

            <section className="afilm-profile-section">
              <div className="afilm-profile-section__heading"><Monitor size={14} aria-hidden="true" /><h3>Device & Entry</h3></div>
              <div className="afilm-profile-details">
                <DetailItem label="Browser / device" value={[session.browser, session.device].filter(Boolean).join(" · ")} />
                <DetailItem label="Viewport" value={session.viewport} mono />
                <DetailItem label="Protocol / TLS" value={[session.httpProtocol, session.tlsVersion].filter(Boolean).join(" · ")} />
                <DetailItem label="Language / timezone" value={[session.language, session.timezone].filter(Boolean).join(" · ")} />
                <DetailItem label="Entry path" value={session.path} mono />
                <DetailItem label="Referrer" value={session.referrer || "Direct"} />
                <DetailItem label="Entered" value={formatTime(session.startedAt)} />
                <DetailItem label="Last signal" value={formatTime(session.lastSeen)} />
              </div>
              <details className="afilm-profile-agent"><summary>Full user agent</summary><code>{session.userAgent || "Unavailable"}</code></details>
            </section>

            <section className="afilm-profile-section">
              <div className="afilm-profile-section__heading"><Route size={14} aria-hidden="true" /><h3>Session Timeline</h3><span>{profile.events?.length || 0} stored events</span></div>
              <div className="afilm-profile-timeline">
                {profile.events?.length ? profile.events.map((event) => { const copy = eventCopy(event); return <article key={event.id}><i /><time>{timeOnlyFormat.format(new Date(event.occurredAt))}</time><div><strong>{copy.label}</strong><span>{copy.detail}</span>{Number(event.data?.duration) > 0 && <small>{formatDuration(event.data.currentTime)} of {formatDuration(event.data.duration)}</small>}</div></article>; }) : <div className="afilm-admin-empty afilm-admin-empty--small"><Route size={18} aria-hidden="true" /><p>No timeline events stored.</p></div>}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function MovieAdmin() {
  useSeo({ title: "AFilm Intelligence", description: "Private AFilm audience and playback analytics.", path: "/movie/admin", robots: "noindex, nofollow, noarchive, nosnippet, noimageindex" });
  const api = resolveMovieAnalyticsApi();
  const [token, setToken] = useState(() => window.sessionStorage.getItem(MOVIE_ANALYTICS_ADMIN_TOKEN_KEY) || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(0);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async (accessToken = token, { quiet = false } = {}) => {
    if (!api || !accessToken) return false;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${api}/afilm/analytics/summary`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", credentials: "omit" });
      if (response.status === 401 || response.status === 403) throw new Error("That admin token was not accepted.");
      if (!response.ok) throw new Error(response.status === 503 ? "Configure and deploy the analytics Worker first." : "The analytics service is unavailable. Try refreshing.");
      setData(await response.json());
      setError("");
      setLastRefresh(Date.now());
      return true;
    } catch (loadError) {
      setError(loadError.message || "Could not load analytics. Try refreshing.");
      return false;
    } finally { setLoading(false); }
  }, [api, token]);

  const access = useCallback(async (nextToken) => {
    const clean = nextToken.trim();
    if (!clean) return;
    if (await load(clean)) {
      window.sessionStorage.setItem(MOVIE_ANALYTICS_ADMIN_TOKEN_KEY, clean);
      setToken(clean);
    }
  }, [load]);

  const openProfile = useCallback(async (sessionId) => {
    setProfileOpen(true);
    setProfile(null);
    setProfileError("");
    setProfileLoading(true);
    try {
      const response = await fetch(`${api}/afilm/analytics/session/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("This visitor profile could not be loaded. Refresh the dashboard and try again.");
      setProfile(await response.json());
    } catch (profileLoadError) { setProfileError(profileLoadError.message); }
    finally { setProfileLoading(false); }
  }, [api, token]);

  useEffect(() => {
    if (!token) return undefined;
    load(token);
    const interval = window.setInterval(() => load(token, { quiet: true }), 10_000);
    return () => window.clearInterval(interval);
  }, [load, token]);

  const logout = () => {
    window.sessionStorage.removeItem(MOVIE_ANALYTICS_ADMIN_TOKEN_KEY);
    setToken(""); setData(null); setError(""); setProfileOpen(false);
  };

  const overview = data?.overview || {};
  const recent = data?.recent || [];
  const topTitles = data?.topTitles || [];
  const maxTitleStarts = useMemo(() => Math.max(1, ...topTitles.map((item) => Number(item.starts) || 0)), [topTitles]);
  const referrerTotal = useMemo(() => Math.max(1, (data?.referrers || []).reduce((sum, item) => sum + (Number(item.sessions) || 0), 0)), [data?.referrers]);

  if (!token || (!data && error)) return <div className="afilm-admin-page"><AccessGate apiReady={Boolean(api)} loading={loading} error={error} onAccess={access} /></div>;

  return (
    <div className="afilm-admin-page">
      <a className="afilm-admin-skip" href="#afilm-admin-main">Skip to dashboard</a>
      <header className="afilm-admin-header">
        <a href="/movie" className="afilm-admin-brand" aria-label="Open AFilm"><span>AFilm</span><i>Intelligence</i></a>
        <nav aria-label="Dashboard sections"><a href="#overview">Overview</a><a href="#live">Live</a><a href="#sessions">Sessions</a></nav>
        <div className="afilm-admin-header__status"><span><i /> Live</span><small>{lastRefresh ? `Updated ${relativeTime(lastRefresh)}` : "Connecting…"}</small></div>
        <div className="afilm-admin-header__actions"><button type="button" onClick={() => load(token)} disabled={loading} aria-label="Refresh analytics"><RefreshCw className={loading ? "afilm-admin-spin" : ""} size={16} aria-hidden="true" /></button><button type="button" onClick={logout} aria-label="Lock dashboard"><LogOut size={16} aria-hidden="true" /></button></div>
      </header>

      <main id="afilm-admin-main" className="afilm-admin-main">
        <section id="overview" className="afilm-admin-intro"><div><p className="afilm-admin-kicker">Audience control room</p><h1>Every signal.<br />One clear view.</h1></div><div className="afilm-admin-intro__aside"><span><Radio size={13} aria-hidden="true" /> Polling every 10 seconds</span><p>Live presence uses a 45-second heartbeat. Network location is an IP-based estimate, never an exact address. Raw data expires after {data?.retentionDays || 30} days.</p></div></section>
        {error && <div className="afilm-admin-alert" role="status">{error}</div>}

        <section className="afilm-admin-stats" aria-label="Today at a glance">
          <StatCard icon={Activity} label="Online Now" value={numberFormat.format(overview.onlineNow || 0)} detail="Visible or recently active" tone="live" />
          <StatCard icon={Users} label="Visitors Today" value={numberFormat.format(overview.visitorsToday || 0)} detail={`${numberFormat.format(overview.sessionsToday || 0)} sessions opened`} />
          <StatCard icon={Clock3} label="Average Attention" value={formatDuration(overview.avgActiveSeconds)} detail="Focused time per session" />
          <StatCard icon={Play} label="Watch Starts" value={numberFormat.format(overview.watchStarts || 0)} detail={`${numberFormat.format(overview.completions || 0)} completed plays`} />
        </section>

        <section className="afilm-admin-signal-grid" aria-label="30-day signals">
          <article><Signal size={14} aria-hidden="true" /><div><strong>{numberFormat.format(overview.events30Days || 0)}</strong><span>Stored events</span></div></article>
          <article><Search size={14} aria-hidden="true" /><div><strong>{numberFormat.format(overview.searches30Days || 0)}</strong><span>Search selections</span></div></article>
          <article><Globe2 size={14} aria-hidden="true" /><div><strong>{numberFormat.format(overview.countries30Days || 0)}</strong><span>Countries reached</span></div></article>
          <article><Users size={14} aria-hidden="true" /><div><strong>{numberFormat.format(overview.returningVisitors || 0)}</strong><span>Returning visitors</span></div></article>
          <article><Film size={14} aria-hidden="true" /><div><strong>{preciseNumberFormat.format(overview.avgCompletionPercent || 0)}%</strong><span>Average progress</span></div></article>
          <article><Clock3 size={14} aria-hidden="true" /><div><strong>{numberFormat.format(overview.sessionsToday || 0)}</strong><span>Sessions today</span></div></article>
        </section>

        <section id="live" className="afilm-admin-panel afilm-admin-panel--live">
          <div className="afilm-admin-panel__heading"><div><p><Eye size={14} aria-hidden="true" /> Live Room</p><h2>Watching Now</h2></div><span>{data?.online?.length || 0} active</span></div>
          <div className="afilm-live-list">{data?.online?.length ? data.online.map((session) => <LiveSession key={session.sessionId} session={session} onOpen={openProfile} />) : <div className="afilm-admin-empty"><Activity size={20} aria-hidden="true" /><p>The room is quiet.</p><span>New visitors appear here within a few seconds.</span></div>}</div>
        </section>

        <div className="afilm-admin-columns afilm-admin-columns--content">
          <section className="afilm-admin-panel">
            <div className="afilm-admin-panel__heading"><div><p><Film size={14} aria-hidden="true" /> Content</p><h2>Most Watched</h2></div><span>30 days</span></div>
            <div className="afilm-title-list">{topTitles.length ? topTitles.map((item, index) => <article key={`${item.mediaType}-${item.mediaId}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.mediaType === "tv" ? "Series" : "Film"} · {item.starts} starts · {item.completions || 0} finishes</small><i><b style={{ width: `${(item.starts / maxTitleStarts) * 100}%` }} /></i></div></article>) : <div className="afilm-admin-empty afilm-admin-empty--small"><Film size={18} aria-hidden="true" /><p>No plays recorded yet.</p></div>}</div>
          </section>

          <section className="afilm-admin-panel">
            <div className="afilm-admin-panel__heading"><div><p><Activity size={14} aria-hidden="true" /> Stream</p><h2>Latest Activity</h2></div><span>{data?.activity?.length || 0}</span></div>
            <div className="afilm-activity-list">{data?.activity?.length ? data.activity.slice(0, 18).map((event) => { const copy = eventCopy(event); return <button type="button" key={event.id} onClick={() => openProfile(event.sessionId)}><i /><div><strong>{copy.label}</strong><span>{copy.detail} · {locationLabel(event)}</span></div><time>{relativeTime(event.occurredAt)}</time><ChevronRight size={13} aria-hidden="true" /></button>; }) : <div className="afilm-admin-empty afilm-admin-empty--small"><Activity size={18} aria-hidden="true" /><p>No activity recorded yet.</p></div>}</div>
          </section>
        </div>

        <div className="afilm-admin-columns afilm-admin-columns--insight">
          <section className="afilm-admin-panel">
            <div className="afilm-admin-panel__heading"><div><p><Globe2 size={14} aria-hidden="true" /> Geography</p><h2>Top Locations</h2></div><span>IP estimate</span></div>
            <div className="afilm-location-list">{data?.locations?.length ? data.locations.slice(0, 12).map((location, index) => <article key={`${location.country}-${location.region}-${location.city}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{locationLabel(location)}</strong><small>{location.visitors} visitors · {location.sessions} sessions · latest {relativeTime(location.lastSeen)}</small></div><MapAction session={location} compact /></article>) : <div className="afilm-admin-empty afilm-admin-empty--small"><Globe2 size={18} aria-hidden="true" /><p>No location data yet.</p></div>}</div>
          </section>

          <section className="afilm-admin-panel">
            <div className="afilm-admin-panel__heading"><div><p><Route size={14} aria-hidden="true" /> Acquisition</p><h2>Traffic Sources</h2></div><span>30 days</span></div>
            <div className="afilm-referrer-list">{data?.referrers?.length ? data.referrers.slice(0, 12).map((item, index) => <article key={`${item.referrer}-${index}`}><Route size={13} aria-hidden="true" /><div><strong>{referrerName(item.referrer)}</strong><small>{item.visitors} visitors · {item.sessions} sessions</small></div><span>{Math.round((item.sessions / referrerTotal) * 100)}%</span></article>) : <div className="afilm-admin-empty afilm-admin-empty--small"><Route size={18} aria-hidden="true" /><p>No referrer data yet.</p></div>}</div>
          </section>

          <section className="afilm-admin-panel">
            <div className="afilm-admin-panel__heading"><div><p><Search size={14} aria-hidden="true" /> Discovery</p><h2>Recent Searches</h2></div><span>{data?.searches?.length || 0}</span></div>
            <div className="afilm-search-list">{data?.searches?.length ? data.searches.slice(0, 12).map((item, index) => <article key={`${item.occurredAt}-${index}`}><Search size={14} aria-hidden="true" /><div><strong>{item.query || "Direct result"}</strong><small>Opened {item.resultTitle || "a title"} · {relativeTime(item.occurredAt)}</small></div></article>) : <div className="afilm-admin-empty afilm-admin-empty--small"><Search size={18} aria-hidden="true" /><p>No searches recorded yet.</p></div>}</div>
          </section>
        </div>

        <section id="sessions" className="afilm-admin-panel">
          <div className="afilm-admin-panel__heading"><div><p><Users size={14} aria-hidden="true" /> Session Ledger</p><h2>Recent Visits</h2></div><span>{recent.length} shown</span></div>
          <div className="afilm-session-table" role="table" aria-label="Recent AFilm sessions">
            <div className="afilm-session-table__head" role="row"><span>Visitor</span><span>Activity</span><span>Location & Network</span><span>Entered</span><span>Stayed</span><span>Profile</span></div>
            {recent.map((session) => <div className="afilm-session-table__row" role="row" key={session.sessionId}><span><strong>{session.visitorId?.slice(-8) || "anonymous"}</strong><small>{session.browser || "Unknown browser"} · {session.device || session.viewport || "Unknown device"}</small></span><span><strong>{mediaLabel(session)}</strong><small>{session.eventCount || 0} signals · {session.searchCount || 0} searches</small></span><span><strong>{locationLabel(session)}</strong><small>{session.ip || "IP unavailable"} · {session.asOrganization || "Network unknown"}</small></span><span><strong>{formatTime(session.startedAt)}</strong><small>{session.referrer ? `from ${referrerName(session.referrer)}` : "direct visit"}</small></span><span><strong>{formatDuration(session.activeSeconds)}</strong><small>{session.endedAt ? `left ${relativeTime(session.endedAt)}` : `seen ${relativeTime(session.lastSeen)}`}</small></span><span className="afilm-session-table__action"><MapAction session={session} compact /><button type="button" onClick={() => openProfile(session.sessionId)} aria-label={`Open profile for visitor ${session.visitorId?.slice(-8) || "anonymous"}`}><ChevronRight size={14} aria-hidden="true" /></button></span></div>)}
            {!recent.length && <div className="afilm-admin-empty"><Users size={20} aria-hidden="true" /><p>No visits recorded yet.</p></div>}
          </div>
        </section>
      </main>
      {profileOpen && <VisitorProfile profile={profile} loading={profileLoading} error={profileError} onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
