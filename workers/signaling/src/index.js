/**
 * Filzy — Signaling Worker + BeamRoom Durable Object.
 *
 * Brokers the tiny WebRTC handshake (SDP/ICE) between two peers of a Beam.
 * Beam remains pure peer-to-peer, so Beam file bytes never pass through here.
 * Each Beam id maps to one Durable Object "room"; peers connect over a
 * WebSocket and the room relays messages, targeted (by `to`) or broadcast.
 * Drop and Pool use the same Worker for short-link metadata and streamed
 * downloads; file bodies are passed through without being buffered or stored.
 *
 * Client contract (src/lib/signaling.js → WebSocketSignaling):
 *   wss://<worker>/beam/<beamId>?self=<peerId>
 *   messages are JSON: { kind, beam, from, to?, sdp?, candidate?, __id? }
 *
 * Also serves GET /turn → short-lived Cloudflare TURN credentials, dormant
 * until TURN_KEY_ID / TURN_KEY_SECRET secrets are set.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/afilm/analytics/")) {
      if (request.method === "OPTIONS") return analyticsCors(request, new Response(null, { status: 204 }));
      return analyticsCors(request, await analyticsGateway(request, url, env));
    }
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/" || url.pathname === "/health") {
      return cors(json({ ok: true, service: "filzy-signaling" }));
    }
    if (url.pathname === "/turn") return cors(await turnCreds(env));
    if (url.pathname.startsWith("/transfer/")) return cors(await proxyTransferApi(request, url, env));

    const poolMatch = url.pathname.match(/^\/pool\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
    if (poolMatch) {
      const id = env.BEAM_ROOMS.idFromName(`pool-${poolMatch[1]}`);
      return cors(await env.BEAM_ROOMS.get(id).fetch(request));
    }

    const dropMatch = url.pathname.match(/^\/drop\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
    if (dropMatch) {
      const id = env.BEAM_ROOMS.idFromName(`drop-${dropMatch[1]}`);
      return cors(await env.BEAM_ROOMS.get(id).fetch(request));
    }

    const match = url.pathname.match(/^\/beam\/([A-Za-z0-9_-]+)$/);
    if (!match) return cors(new Response("Not found", { status: 404 }));

    const id = env.BEAM_ROOMS.idFromName(match[1]);
    return env.BEAM_ROOMS.get(id).fetch(request);
  },
};

// Mint short-lived TURN credentials from a Cloudflare TURN key. Returns an empty
// iceServers list (harmless — client falls back to STUN) until the key secrets
// are configured, so signaling works the instant this Worker is deployed.
async function turnCreds(env) {
  const keyId = env.TURN_KEY_ID;
  const keySecret = env.TURN_KEY_SECRET;
  if (!keyId || !keySecret) return json({ iceServers: [] });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${keySecret}`, "Content-Type": "application/json" },
      // ~1h TTL: comfortably longer than any transfer, still short enough that a
      // leaked credential expires fast.
      body: JSON.stringify({ ttl: 3600 }),
    });
    if (!r.ok) return json({ iceServers: [] });
    return json(await r.json()); // { iceServers: { urls, username, credential } }
  } catch {
    return json({ iceServers: [] });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" } });
}
function cors(res) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
    webSocket: res.webSocket,
  });
}

const AFILM_ALLOWED_ORIGINS = new Set([
  "https://filzy.site",
  "https://www.filzy.site",
  "http://localhost:4177",
  "http://127.0.0.1:4177",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function analyticsCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin") || "";
  if (AFILM_ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function analyticsGateway(request, url, env) {
  const origin = request.headers.get("origin") || "";
  const collecting = url.pathname === "/afilm/analytics/collect";
  if ((collecting && !AFILM_ALLOWED_ORIGINS.has(origin)) || (origin && !AFILM_ALLOWED_ORIGINS.has(origin))) return poolJson({ error: "Origin not allowed." }, 403);
  if (!env.AFILM_ANALYTICS) return poolJson({ error: "Analytics storage is not configured." }, 503);

  if (url.pathname === "/afilm/analytics/collect" && request.method !== "POST") return poolJson({ error: "Method not allowed." }, 405);
  const adminRoute = url.pathname === "/afilm/analytics/summary" || /^\/afilm\/analytics\/session\/[A-Za-z0-9_-]+$/.test(url.pathname);
  if (adminRoute) {
    if (request.method !== "GET") return poolJson({ error: "Method not allowed." }, 405);
    if (!env.AFILM_ADMIN_TOKEN) return poolJson({ error: "Analytics admin access is not configured." }, 503);
    const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!await secureSecretEqual(supplied, env.AFILM_ADMIN_TOKEN)) return poolJson({ error: "Unauthorized." }, 401);
  } else if (url.pathname !== "/afilm/analytics/collect") {
    return poolJson({ error: "Not found." }, 404);
  }

  const headers = new Headers(request.headers);
  const cf = request.cf || {};
  headers.set("x-afilm-ip", cleanAnalyticsText(request.headers.get("cf-connecting-ip"), 80));
  headers.set("x-afilm-country", cleanAnalyticsText(cf.country, 8));
  headers.set("x-afilm-region", cleanAnalyticsText(cf.region, 120));
  headers.set("x-afilm-city", cleanAnalyticsText(cf.city, 120));
  headers.set("x-afilm-timezone", cleanAnalyticsText(cf.timezone, 80));
  headers.set("x-afilm-colo", cleanAnalyticsText(cf.colo, 12));
  headers.set("x-afilm-continent", cleanAnalyticsText(cf.continent, 8));
  headers.set("x-afilm-region-code", cleanAnalyticsText(cf.regionCode, 12));
  headers.set("x-afilm-postal-code", cleanAnalyticsText(cf.postalCode, 32));
  headers.set("x-afilm-metro-code", cleanAnalyticsText(cf.metroCode, 16));
  headers.set("x-afilm-latitude", cleanAnalyticsText(cf.latitude, 32));
  headers.set("x-afilm-longitude", cleanAnalyticsText(cf.longitude, 32));
  headers.set("x-afilm-asn", cleanAnalyticsText(cf.asn, 20));
  headers.set("x-afilm-as-organization", cleanAnalyticsText(cf.asOrganization, 180));
  headers.set("x-afilm-http-protocol", cleanAnalyticsText(cf.httpProtocol, 24));
  headers.set("x-afilm-tls-version", cleanAnalyticsText(cf.tlsVersion, 24));
  headers.set("x-afilm-tcp-rtt", cleanAnalyticsText(cf.clientTcpRtt, 20));
  headers.set("x-afilm-quic-rtt", cleanAnalyticsText(cf.clientQuicRtt, 20));
  headers.set("x-afilm-is-eu", cf.isEUCountry === "1" ? "1" : "0");
  headers.set("x-afilm-admin-ok", adminRoute ? "1" : "0");
  const forwarded = new Request(request, { headers });
  const id = env.AFILM_ANALYTICS.idFromName("afilm-global");
  return env.AFILM_ANALYTICS.get(id).fetch(forwarded);
}

async function secureSecretEqual(left, right) {
  if (!left || !right) return false;
  const [leftHash, rightHash] = await Promise.all([hashSecret(left), hashSecret(right)]);
  let different = leftHash.length ^ rightHash.length;
  for (let index = 0; index < Math.max(leftHash.length, rightHash.length); index += 1) {
    different |= (leftHash.charCodeAt(index) || 0) ^ (rightHash.charCodeAt(index) || 0);
  }
  return different === 0;
}

/** One room per Beam. Relays signaling between peers using hibernatable
 *  WebSockets, so an idle room consumes no compute while staying connected. */
export class BeamRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/pool/")) return this.poolRequest(request, url);
    if (url.pathname.startsWith("/drop/")) return this.dropRequest(request, url);
    const self = url.searchParams.get("self");
    if (request.headers.get("Upgrade") !== "websocket" || !self) {
      return new Response("Expected a WebSocket with ?self=", { status: 426 });
    }
    const beam = (url.pathname.match(/\/beam\/([^/?]+)/) || [])[1] || "";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation API: tag the socket with its peer id so we can target relays
    // after the DO wakes (in-memory maps don't survive hibernation). The
    // attachment carries the peer + beam id for the server-generated "bye".
    this.ctx.acceptWebSocket(server, [self]);
    server.serializeAttachment({ self, beam });

    return new Response(null, { status: 101, webSocket: client });
  }

  async poolRequest(request, url) {
    const fileMatch = url.pathname.match(/^\/pool\/[^/]+\/files\/([A-Za-z0-9_-]+)\/(\d+)$/);
    const action = (url.pathname.match(/^\/pool\/[^/]+(?:\/(init|batches|close|unlock))?$/) || [])[1] || "read";
    const state = await this.ctx.storage.get("pool");
    if (["GET", "HEAD"].includes(request.method) && fileMatch) {
      if (!state) return poolJson({ error: "Pool not found." }, 404);
      if (state.expiresAt <= Date.now()) return poolJson({ error: "This pool has expired." }, 410);
      const batch = state.batches.find((candidate) => candidate.id === fileMatch[1]);
      if (!batch) return poolJson({ error: "File not found." }, 404);
      if (!await transferAccessAllowed(state, url.searchParams.get("access"))) return poolJson({ error: "Password required." }, 401);
      return proxyTransferFile(request, batch.access, Number(fileMatch[2]), batch.files);
    }
    if (request.method === "GET" && action === "read") {
      if (!state) return poolJson({ error: "Pool not found." }, 404);
      if (state.expiresAt <= Date.now()) {
        await this.ctx.storage.deleteAll();
        return poolJson({ error: "This pool has expired." }, 410);
      }
      return poolJson(publicPool(state, await transferAccessAllowed(state, url.searchParams.get("access"))));
    }

    if (request.method !== "POST") return poolJson({ error: "Method not allowed." }, 405);
    const body = await safePoolJson(request);
    if (!body) return poolJson({ error: "Invalid pool request." }, 400);

    if (action === "init") {
      if (state) return poolJson({ error: "Pool already exists." }, 409);
      const days = Number(body.expiresInDays);
      const password = cleanPassword(body.password);
      if (![1, 7].includes(days) || !validSecret(body.ownerSecret) || password === null) return poolJson({ error: "Invalid pool settings." }, 400);
      const accessToken = password ? randomSecret() : "";
      const pool = {
        name: cleanPoolText(body.name, 80) || "Shared pool",
        ownerHash: await hashSecret(body.ownerSecret),
        createdAt: Date.now(),
        expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
        closed: false,
        passwordHash: password ? await hashSecret(password) : "",
        accessToken,
        accessHash: accessToken ? await hashSecret(accessToken) : "",
        maxDownloads: cleanMaxDownloads(body.maxDownloads),
        batches: [],
      };
      await this.ctx.storage.put("pool", pool);
      await this.ctx.storage.setAlarm(pool.expiresAt);
      return poolJson(publicPool(pool, true), 201);
    }

    if (!state) return poolJson({ error: "Pool not found." }, 404);
    if (state.expiresAt <= Date.now()) return poolJson({ error: "This pool has expired." }, 410);
    if (action === "unlock") {
      if (!state.passwordHash || await hashSecret(String(body.password || "")) !== state.passwordHash) return poolJson({ error: "Incorrect password." }, 401);
      return poolJson({ ...publicPool(state, true), accessToken: state.accessToken });
    }
    if (action === "close") {
      if (!validSecret(body.ownerSecret) || await hashSecret(body.ownerSecret) !== state.ownerHash) return poolJson({ error: "Only the pool owner can close it." }, 403);
      state.closed = true;
      await this.ctx.storage.put("pool", state);
      return poolJson(publicPool(state, true));
    }
    if (action === "batches") {
      if (state.closed) return poolJson({ error: "This pool is closed." }, 409);
      const transferId = String(body.transferId || "");
      const files = Array.isArray(body.files) ? body.files.slice(0, 500).map((file) => ({
        name: cleanPoolText(file?.name, 220) || "file",
        size: Math.max(0, Math.min(Number(file?.size) || 0, 50 * 1024 ** 3)),
        kind: cleanPoolText(file?.kind, 24),
      })) : [];
      const access = cleanTransferAccess(body.access, files);
      if (!/^[A-Za-z0-9_-]+$/.test(transferId) || files.length < 1 || !access) return poolJson({ error: "Invalid transfer metadata." }, 400);
      if (state.batches.some((batch) => batch.transferId === transferId)) return poolJson(publicPool(state, true));
      state.batches.push({
        id: crypto.randomUUID(),
        transferId,
        createdAt: Date.now(),
        files,
        access,
      });
      state.batches = state.batches.slice(-100);
      await this.ctx.storage.put("pool", state);
      return poolJson(publicPool(state, true), 201);
    }
    return poolJson({ error: "Not found." }, 404);
  }

  async dropRequest(request, url) {
    const state = await this.ctx.storage.get("drop");
    const fileMatch = url.pathname.match(/^\/drop\/[^/]+\/files\/(\d+)$/);
    if (["GET", "HEAD"].includes(request.method) && fileMatch) {
      if (!state) return poolJson({ error: "Transfer not found." }, 404);
      if (state.expiresAt <= Date.now()) return poolJson({ error: "This transfer has expired." }, 410);
      if (!await transferAccessAllowed(state, url.searchParams.get("access"))) return poolJson({ error: "Password required." }, 401);
      return proxyTransferFile(request, state.access, Number(fileMatch[1]), state.files);
    }
    if (request.method === "GET") {
      if (!state) return poolJson({ error: "Transfer not found." }, 404);
      if (state.expiresAt <= Date.now()) {
        await this.ctx.storage.deleteAll();
        return poolJson({ error: "This transfer has expired." }, 410);
      }
      return poolJson(publicDrop(state, await transferAccessAllowed(state, url.searchParams.get("access"))));
    }
    if (request.method !== "POST") return poolJson({ error: "Method not allowed." }, 405);
    const body = await safePoolJson(request);
    if (url.pathname.endsWith("/unlock")) {
      if (!state) return poolJson({ error: "Transfer not found." }, 404);
      if (!state.passwordHash || await hashSecret(String(body?.password || "")) !== state.passwordHash) return poolJson({ error: "Incorrect password." }, 401);
      return poolJson({ ...publicDrop(state, true), accessToken: state.accessToken });
    }
    if (state) return poolJson({ error: "Transfer already exists." }, 409);
    const days = Number(body?.expiresInDays);
    const transferId = String(body?.transferId || "");
    const files = Array.isArray(body?.files) ? body.files.slice(0, 500).map((file) => ({
      name: cleanPoolText(file?.name, 220) || "file",
      size: Math.max(0, Math.min(Number(file?.size) || 0, 50 * 1024 ** 3)),
      kind: cleanPoolText(file?.kind, 80),
    })) : [];
    const access = cleanTransferAccess(body?.access, files);
    const password = cleanPassword(body?.password);
    if (![1, 7].includes(days) || password === null || !/^[A-Za-z0-9_-]+$/.test(transferId) || files.length < 1 || !access) {
      return poolJson({ error: "Invalid transfer metadata." }, 400);
    }
    const accessToken = password ? randomSecret() : "";
    const drop = {
      note: cleanPoolText(body.note, 100),
      transferId,
      files,
      access,
      passwordHash: password ? await hashSecret(password) : "",
      accessToken,
      accessHash: accessToken ? await hashSecret(accessToken) : "",
      maxDownloads: cleanMaxDownloads(body?.maxDownloads),
      createdAt: Date.now(),
      expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
    };
    await this.ctx.storage.put("drop", drop);
    await this.ctx.storage.setAlarm(drop.expiresAt);
    return poolJson(publicDrop(drop, true), 201);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== "string") return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.to) {
      // Targeted relay (offer / answer / ice) — send only to the addressed peer.
      for (const peer of this.ctx.getWebSockets(msg.to)) {
        try {
          peer.send(raw);
        } catch {
          /* peer closing */
        }
      }
    } else {
      // Broadcast (hello / join / bye) to everyone except the sender.
      for (const peer of this.ctx.getWebSockets()) {
        if (peer === ws) continue;
        try {
          peer.send(raw);
        } catch {
          /* peer closing */
        }
      }
    }
  }

  webSocketClose(ws) {
    this.announceBye(ws);
  }
  webSocketError(ws) {
    this.announceBye(ws);
  }

  // Tell the rest of the room a peer left, so the other side can react instead
  // of hanging. Includes `beam` because the client ignores messages for a
  // different beam id.
  announceBye(ws) {
    let att;
    try {
      att = ws.deserializeAttachment();
    } catch {
      att = null;
    }
    if (!att || !att.self) return;
    const bye = JSON.stringify({ kind: "bye", beam: att.beam, from: att.self });
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(bye);
      } catch {
        /* peer closing */
      }
    }
  }
}

const AFILM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AFILM_ONLINE_WINDOW_MS = 45_000;

/** One SQLite-backed Durable Object stores AFilm's consented audience events.
 * Raw sessions and events are automatically removed after 30 days. */
export class AFilmAnalytics {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          visitor_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          last_seen INTEGER NOT NULL,
          ended_at INTEGER,
          active_seconds REAL NOT NULL DEFAULT 0,
          path TEXT NOT NULL DEFAULT '',
          referrer TEXT NOT NULL DEFAULT '',
          language TEXT NOT NULL DEFAULT '',
          timezone TEXT NOT NULL DEFAULT '',
          viewport TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          browser TEXT NOT NULL DEFAULT '',
          device TEXT NOT NULL DEFAULT '',
          ip TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          colo TEXT NOT NULL DEFAULT '',
          continent TEXT NOT NULL DEFAULT '',
          region_code TEXT NOT NULL DEFAULT '',
          postal_code TEXT NOT NULL DEFAULT '',
          metro_code TEXT NOT NULL DEFAULT '',
          latitude REAL,
          longitude REAL,
          asn INTEGER,
          as_organization TEXT NOT NULL DEFAULT '',
          http_protocol TEXT NOT NULL DEFAULT '',
          tls_version TEXT NOT NULL DEFAULT '',
          client_tcp_rtt REAL,
          client_quic_rtt REAL,
          is_eu_country INTEGER NOT NULL DEFAULT 0,
          current_media_id TEXT NOT NULL DEFAULT '',
          current_type TEXT NOT NULL DEFAULT '',
          current_title TEXT NOT NULL DEFAULT '',
          current_season INTEGER,
          current_episode INTEGER,
          current_time REAL NOT NULL DEFAULT 0,
          duration REAL NOT NULL DEFAULT 0,
          playing INTEGER NOT NULL DEFAULT 0,
          visible INTEGER NOT NULL DEFAULT 0,
          focused INTEGER NOT NULL DEFAULT 0,
          event_count INTEGER NOT NULL DEFAULT 0,
          search_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions(last_seen DESC);
        CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS sessions_visitor_idx ON sessions(visitor_id, started_at DESC);
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          media_id TEXT NOT NULL DEFAULT '',
          media_type TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          season INTEGER,
          episode INTEGER,
          data_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS events_session_idx ON events(session_id, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS events_type_time_idx ON events(event_type, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS events_media_idx ON events(media_type, media_id, occurred_at DESC);
      `);
      const additionalColumns = [
        ["continent", "TEXT NOT NULL DEFAULT ''"],
        ["region_code", "TEXT NOT NULL DEFAULT ''"],
        ["postal_code", "TEXT NOT NULL DEFAULT ''"],
        ["metro_code", "TEXT NOT NULL DEFAULT ''"],
        ["latitude", "REAL"],
        ["longitude", "REAL"],
        ["asn", "INTEGER"],
        ["as_organization", "TEXT NOT NULL DEFAULT ''"],
        ["http_protocol", "TEXT NOT NULL DEFAULT ''"],
        ["tls_version", "TEXT NOT NULL DEFAULT ''"],
        ["client_tcp_rtt", "REAL"],
        ["client_quic_rtt", "REAL"],
        ["is_eu_country", "INTEGER NOT NULL DEFAULT 0"],
      ];
      for (const [column, definition] of additionalColumns) {
        try { this.sql.exec(`ALTER TABLE sessions ADD COLUMN ${column} ${definition}`); } catch { /* column already exists */ }
      }
      if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/collect") && request.method === "POST") return this.collect(request);
    if (url.pathname.endsWith("/summary") && request.method === "GET" && request.headers.get("x-afilm-admin-ok") === "1") return this.summary();
    const sessionMatch = url.pathname.match(/\/session\/([A-Za-z0-9_-]+)$/);
    if (sessionMatch && request.method === "GET" && request.headers.get("x-afilm-admin-ok") === "1") return this.sessionDetail(sessionMatch[1]);
    return poolJson({ error: "Not found." }, 404);
  }

  async collect(request) {
    const body = await readAnalyticsBody(request);
    if (!body) return poolJson({ error: "Invalid analytics payload." }, 400);
    const sessionId = cleanAnalyticsId(body.sessionId, "s_");
    const visitorId = cleanAnalyticsId(body.visitorId, "v_");
    const eventType = cleanAnalyticsEvent(body.eventType);
    if (!sessionId || !visitorId || !eventType) return poolJson({ error: "Invalid analytics identifiers." }, 400);

    const now = Date.now();
    const reportedTime = Number(body.occurredAt);
    const occurredAt = Number.isFinite(reportedTime) && Math.abs(reportedTime - now) < 24 * 60 * 60 * 1000 ? Math.round(reportedTime) : now;
    const client = body.client && typeof body.client === "object" ? body.client : {};
    const eventData = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
    const media = cleanAnalyticsMedia(body.media);
    const userAgent = cleanAnalyticsText(client.userAgent, 500);
    const agent = analyticsAgent(userAgent);
    const activeIncrement = eventType === "heartbeat" ? cleanAnalyticsNumber(eventData.activeSeconds, 0, 30) : 0;
    const hasCurrentTime = Object.prototype.hasOwnProperty.call(eventData, "currentTime");
    const hasDuration = Object.prototype.hasOwnProperty.call(eventData, "duration");
    const hasPlaying = typeof eventData.playing === "boolean";
    const currentTime = cleanAnalyticsNumber(eventData.currentTime, 0, 24 * 60 * 60);
    const duration = cleanAnalyticsNumber(eventData.duration, 0, 24 * 60 * 60);
    const playing = hasPlaying ? eventData.playing : eventType === "player_play";
    const endedAt = eventType === "session_end" ? occurredAt : null;
    const searchIncrement = eventType === "search_result_open" ? 1 : 0;

    this.sql.exec(
      "INSERT OR IGNORE INTO sessions (session_id, visitor_id, started_at, last_seen) VALUES (?, ?, ?, ?)",
      sessionId, visitorId, occurredAt, occurredAt,
    );
    this.sql.exec(`
      UPDATE sessions SET
        visitor_id = ?, last_seen = ?, ended_at = ?, active_seconds = active_seconds + ?,
        path = ?, referrer = CASE WHEN referrer = '' THEN ? ELSE referrer END,
        language = ?, timezone = ?, viewport = ?, user_agent = ?, browser = ?, device = ?,
        ip = ?, country = ?, region = ?, city = ?, colo = ?,
        continent = ?, region_code = ?, postal_code = ?, metro_code = ?, latitude = ?, longitude = ?,
        asn = ?, as_organization = ?, http_protocol = ?, tls_version = ?, client_tcp_rtt = ?, client_quic_rtt = ?, is_eu_country = ?,
        current_media_id = ?, current_type = ?, current_title = ?, current_season = ?, current_episode = ?,
        current_time = CASE WHEN ? = 1 THEN ? ELSE current_time END,
        duration = CASE WHEN ? = 1 THEN ? ELSE duration END,
        playing = CASE WHEN ? = 1 THEN ? ELSE playing END,
        visible = ?, focused = ?,
        event_count = event_count + 1, search_count = search_count + ?
      WHERE session_id = ?
    `,
    visitorId, occurredAt, endedAt, activeIncrement,
    cleanAnalyticsText(client.path, 600), cleanAnalyticsText(client.referrer, 600),
    cleanAnalyticsText(client.language, 40), cleanAnalyticsText(client.timezone || request.headers.get("x-afilm-timezone"), 80), cleanAnalyticsText(client.viewport, 40), userAgent, agent.browser, agent.device,
    cleanAnalyticsText(request.headers.get("x-afilm-ip"), 80), cleanAnalyticsText(request.headers.get("x-afilm-country"), 8), cleanAnalyticsText(request.headers.get("x-afilm-region"), 120), cleanAnalyticsText(request.headers.get("x-afilm-city"), 120), cleanAnalyticsText(request.headers.get("x-afilm-colo"), 12),
    cleanAnalyticsText(request.headers.get("x-afilm-continent"), 8), cleanAnalyticsText(request.headers.get("x-afilm-region-code"), 12), cleanAnalyticsText(request.headers.get("x-afilm-postal-code"), 32), cleanAnalyticsText(request.headers.get("x-afilm-metro-code"), 16), cleanAnalyticsCoordinate(request.headers.get("x-afilm-latitude"), -90, 90), cleanAnalyticsCoordinate(request.headers.get("x-afilm-longitude"), -180, 180),
    cleanAnalyticsInteger(request.headers.get("x-afilm-asn"), 0, 4_294_967_295), cleanAnalyticsText(request.headers.get("x-afilm-as-organization"), 180), cleanAnalyticsText(request.headers.get("x-afilm-http-protocol"), 24), cleanAnalyticsText(request.headers.get("x-afilm-tls-version"), 24), cleanAnalyticsCoordinate(request.headers.get("x-afilm-tcp-rtt"), 0, 120_000), cleanAnalyticsCoordinate(request.headers.get("x-afilm-quic-rtt"), 0, 120_000), request.headers.get("x-afilm-is-eu") === "1" ? 1 : 0,
    media.mediaId, media.mediaType, media.title, media.season, media.episode,
    hasCurrentTime ? 1 : 0, currentTime, hasDuration ? 1 : 0, duration, hasPlaying || eventType === "player_play" ? 1 : 0, playing ? 1 : 0, body.visible ? 1 : 0, body.focused ? 1 : 0,
    searchIncrement, sessionId);

    if (shouldStoreAnalyticsEvent(eventType)) {
      this.sql.exec(`
        INSERT INTO events (session_id, event_type, occurred_at, media_id, media_type, title, season, episode, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, sessionId, eventType, occurredAt, media.mediaId, media.mediaType, media.title, media.season, media.episode, cleanAnalyticsData(eventData));
    }
    return poolJson({ ok: true }, 202);
  }

  summary() {
    const now = Date.now();
    const onlineSince = now - AFILM_ONLINE_WINDOW_MS;
    const today = new Date(now);
    const dayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const retentionStart = now - AFILM_RETENTION_MS;
    const overview = firstAnalyticsRow(this.sql.exec(`
      SELECT
        (SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL AND last_seen >= ?) AS onlineNow,
        (SELECT COUNT(*) FROM sessions WHERE started_at >= ?) AS sessionsToday,
        (SELECT COUNT(DISTINCT visitor_id) FROM sessions WHERE started_at >= ?) AS visitorsToday,
        (SELECT COALESCE(AVG(active_seconds), 0) FROM sessions WHERE started_at >= ?) AS avgActiveSeconds,
        (SELECT COUNT(*) FROM events WHERE event_type = 'media_open' AND occurred_at >= ?) AS watchStarts,
        (SELECT COUNT(*) FROM events WHERE event_type = 'player_ended' AND occurred_at >= ?) AS completions,
        (SELECT COUNT(*) FROM events WHERE occurred_at >= ?) AS events30Days,
        (SELECT COUNT(*) FROM events WHERE event_type = 'search_result_open' AND occurred_at >= ?) AS searches30Days,
        (SELECT COUNT(DISTINCT country) FROM sessions WHERE started_at >= ? AND country != '') AS countries30Days,
        (SELECT COUNT(*) FROM (SELECT visitor_id FROM sessions WHERE started_at >= ? GROUP BY visitor_id HAVING COUNT(*) > 1)) AS returningVisitors,
        (SELECT COALESCE(AVG((current_time / duration) * 100), 0) FROM sessions WHERE started_at >= ? AND duration > 0) AS avgCompletionPercent
    `, onlineSince, dayStart, dayStart, dayStart, dayStart, dayStart, retentionStart, retentionStart, retentionStart, retentionStart, retentionStart)) || {};

    const online = analyticsRows(this.sql.exec(`${analyticsSessionSelect()} WHERE ended_at IS NULL AND last_seen >= ? ORDER BY last_seen DESC LIMIT 100`, onlineSince));
    const recent = analyticsRows(this.sql.exec(`${analyticsSessionSelect()} ORDER BY started_at DESC LIMIT 100`));
    const topTitles = analyticsRows(this.sql.exec(`
      SELECT media_id AS mediaId, media_type AS mediaType, title,
        SUM(CASE WHEN event_type = 'media_open' THEN 1 ELSE 0 END) AS starts,
        SUM(CASE WHEN event_type = 'player_ended' THEN 1 ELSE 0 END) AS completions
      FROM events
      WHERE occurred_at >= ? AND media_id != '' AND event_type IN ('media_open', 'player_ended')
      GROUP BY media_type, media_id, title
      ORDER BY starts DESC, completions DESC, title ASC
      LIMIT 20
    `, retentionStart));
    const searches = analyticsRows(this.sql.exec(`
      SELECT occurred_at AS occurredAt, data_json AS dataJson
      FROM events WHERE event_type = 'search_result_open'
      ORDER BY occurred_at DESC LIMIT 50
    `)).map((row) => {
      let data = {};
      try { data = JSON.parse(row.dataJson || "{}"); } catch { data = {}; }
      return { occurredAt: row.occurredAt, query: cleanAnalyticsText(data.query, 180), resultTitle: cleanAnalyticsText(data.resultTitle, 180) };
    });
    const locations = analyticsRows(this.sql.exec(`
      SELECT country, region, city, latitude, longitude,
        COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors,
        MAX(last_seen) AS lastSeen
      FROM sessions WHERE started_at >= ? AND country != ''
      GROUP BY country, region, city, latitude, longitude
      ORDER BY sessions DESC, lastSeen DESC LIMIT 30
    `, retentionStart));
    const referrers = analyticsRows(this.sql.exec(`
      SELECT CASE WHEN referrer = '' THEN 'Direct' ELSE referrer END AS referrer,
        COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors
      FROM sessions WHERE started_at >= ?
      GROUP BY CASE WHEN referrer = '' THEN 'Direct' ELSE referrer END
      ORDER BY sessions DESC LIMIT 20
    `, retentionStart));
    const activity = analyticsRows(this.sql.exec(`
      SELECT e.id, e.session_id AS sessionId, s.visitor_id AS visitorId, e.event_type AS eventType,
        e.occurred_at AS occurredAt, e.media_id AS mediaId, e.media_type AS mediaType,
        e.title, e.season, e.episode, e.data_json AS dataJson,
        s.country, s.region, s.city, s.browser, s.device
      FROM events e JOIN sessions s ON s.session_id = e.session_id
      ORDER BY e.occurred_at DESC LIMIT 80
    `)).map(expandAnalyticsEvent);

    return poolJson({
      generatedAt: now,
      retentionDays: 30,
      onlineWindowSeconds: AFILM_ONLINE_WINDOW_MS / 1000,
      overview,
      online,
      recent,
      topTitles,
      searches,
      locations,
      referrers,
      activity,
    });
  }

  sessionDetail(sessionId) {
    const cleanSessionId = cleanAnalyticsId(sessionId, "s_");
    if (!cleanSessionId) return poolJson({ error: "Invalid session." }, 400);
    const session = firstAnalyticsRow(this.sql.exec(`${analyticsSessionSelect({ detailed: true })} WHERE session_id = ? LIMIT 1`, cleanSessionId));
    if (!session) return poolJson({ error: "Session not found." }, 404);
    const events = analyticsRows(this.sql.exec(`
      SELECT id, session_id AS sessionId, event_type AS eventType, occurred_at AS occurredAt,
        media_id AS mediaId, media_type AS mediaType, title, season, episode, data_json AS dataJson
      FROM events WHERE session_id = ? ORDER BY occurred_at DESC LIMIT 50
    `, cleanSessionId)).map(expandAnalyticsEvent).reverse();
    return poolJson({ session, events, retentionDays: 30 });
  }

  async alarm() {
    const cutoff = Date.now() - AFILM_RETENTION_MS;
    this.sql.exec("DELETE FROM events WHERE occurred_at < ?", cutoff);
    this.sql.exec("DELETE FROM sessions WHERE last_seen < ?", cutoff);
    await this.ctx.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);
  }
}

function analyticsSessionSelect({ detailed = false } = {}) {
  return `SELECT
    session_id AS sessionId, visitor_id AS visitorId, started_at AS startedAt, last_seen AS lastSeen,
    ended_at AS endedAt, active_seconds AS activeSeconds, path, referrer, language, timezone, viewport,
    browser, device, ip, country, region, city, colo, continent, region_code AS regionCode,
    postal_code AS postalCode, metro_code AS metroCode, latitude, longitude, asn,
    as_organization AS asOrganization, http_protocol AS httpProtocol, tls_version AS tlsVersion,
    client_tcp_rtt AS clientTcpRtt, client_quic_rtt AS clientQuicRtt, is_eu_country AS isEuCountry,
    ${detailed ? "user_agent AS userAgent," : ""} current_media_id AS currentMediaId,
    current_type AS currentType, current_title AS currentTitle, current_season AS currentSeason,
    current_episode AS currentEpisode, current_time AS currentTime, duration, playing,
    visible, focused, event_count AS eventCount, search_count AS searchCount
  FROM sessions`;
}

function expandAnalyticsEvent(row) {
  let data = {};
  try { data = JSON.parse(row.dataJson || "{}"); } catch { data = {}; }
  const { dataJson, ...event } = row;
  return { ...event, data };
}

function analyticsRows(cursor) {
  return Array.from(cursor || []);
}

function firstAnalyticsRow(cursor) {
  for (const row of cursor || []) return row;
  return null;
}

async function readAnalyticsBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16 * 1024) return null;
  try {
    const text = await request.text();
    if (!text || text.length > 16 * 1024) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

function cleanAnalyticsText(value, max = 180) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function cleanAnalyticsId(value, prefix) {
  const id = cleanAnalyticsText(value, 90);
  return id.startsWith(prefix) && /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function cleanAnalyticsEvent(value) {
  const event = cleanAnalyticsText(value, 50).toLowerCase();
  return AFILM_EVENT_TYPES.has(event) ? event : "";
}

const AFILM_EVENT_TYPES = new Set([
  "session_start",
  "session_end",
  "heartbeat",
  "visibility_hidden",
  "visibility_visible",
  "media_open",
  "search_result_open",
  "search_open",
  "catalog_filter",
  "catalog_load_more",
  "media_close",
  "player_play",
  "player_pause",
  "player_seeked",
  "player_ended",
  "player_timeupdate",
  "player_playerstatus",
  "player_status",
]);

function cleanAnalyticsNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

function cleanAnalyticsCoordinate(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cleanAnalyticsInteger(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function cleanAnalyticsMedia(value) {
  if (!value || typeof value !== "object") return { mediaId: "", mediaType: "", title: "", season: null, episode: null };
  const mediaType = value.mediaType === "tv" ? "tv" : value.mediaType === "movie" ? "movie" : "";
  return {
    mediaId: cleanAnalyticsText(value.mediaId, 80),
    mediaType,
    title: cleanAnalyticsText(value.title, 180),
    season: mediaType === "tv" ? Math.max(1, Math.min(999, Number(value.season) || 1)) : null,
    episode: mediaType === "tv" ? Math.max(1, Math.min(9999, Number(value.episode) || 1)) : null,
  };
}

function cleanAnalyticsData(value) {
  const clean = {};
  for (const [key, item] of Object.entries(value || {}).slice(0, 20)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
    if (typeof item === "boolean") clean[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) clean[key] = Math.max(-1e9, Math.min(1e9, item));
    else if (typeof item === "string") clean[key] = cleanAnalyticsText(item, 240);
  }
  return JSON.stringify(clean).slice(0, 4000);
}

function shouldStoreAnalyticsEvent(eventType) {
  return !["heartbeat", "visibility_hidden", "visibility_visible", "player_timeupdate", "player_playerstatus"].includes(eventType);
}

function analyticsAgent(userAgent) {
  const ua = String(userAgent || "");
  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Microsoft Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/CriOS\//.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS\//.test(ua)) browser = "Firefox iOS";
  else if (/Chrome\//.test(ua)) browser = "Google Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let device = "Desktop";
  if (/iPad/.test(ua)) device = "iPad";
  else if (/iPhone|iPod/.test(ua)) device = "iPhone";
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  else if (/Mobile/.test(ua)) device = "Mobile";
  return { browser, device };
}

function validSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,120}$/.test(value);
}

function cleanPoolText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function cleanPassword(value) {
  const password = String(value || "");
  if (!password) return "";
  return password.length >= 4 && password.length <= 100 ? password : null;
}

function cleanMaxDownloads(value) {
  const count = Number(value || 0);
  return Number.isInteger(count) && count >= 1 && count <= 1000 ? count : 0;
}

function randomSecret() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

async function transferAccessAllowed(state, token) {
  if (!state?.passwordHash) return true;
  return Boolean(token) && await hashSecret(String(token)) === state.accessHash;
}

async function safePoolJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 512 * 1024) return null;
  try {
    const text = await request.text();
    if (text.length > 512 * 1024) return null;
    return JSON.parse(text);
  } catch { return null; }
}

async function hashSecret(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicPool(pool, unlocked = false) {
  return {
    name: pool.name,
    createdAt: pool.createdAt,
    expiresAt: pool.expiresAt,
    closed: pool.closed,
    locked: Boolean(pool.passwordHash) && !unlocked,
    maxDownloads: pool.maxDownloads || 0,
    batches: unlocked || !pool.passwordHash ? pool.batches.map(({ access, ...batch }) => batch) : [],
  };
}

function publicDrop(drop, unlocked = false) {
  const { access, passwordHash, accessToken, accessHash, ...value } = drop;
  if (passwordHash && !unlocked) {
    return { note: value.note, createdAt: value.createdAt, expiresAt: value.expiresAt, locked: true, files: [] };
  }
  return { ...value, locked: false };
}

function cleanTransferAccess(value, files) {
  if (!value || typeof value !== "object") return null;
  const entries = Array.isArray(value.files) ? value.files : [];
  if (value.provider !== "temporary" || entries.length !== files.length) return null;
  const cleaned = entries.map((entry) => ({
    id: String(entry?.id || ""),
    name: String(entry?.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500),
  }));
  if (cleaned.some((entry) => !/^[A-Za-z0-9_-]{9,24}$/.test(entry.id) || !entry.name)) return null;
  return { provider: "temporary", files: cleaned };
}

async function proxyTransferFile(request, access, index, files) {
  const entry = access?.files?.[index];
  const publicFile = files?.[index];
  if (!entry || !publicFile || !Number.isInteger(index) || index < 0) return poolJson({ error: "File not found." }, 404);
  const upstreamUrl = `https://storage.to/${encodeURIComponent(entry.id)}/download`;
  const requestHeaders = new Headers();
  for (const name of ["range", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since"]) {
    const value = request.headers.get(name);
    if (value) requestHeaders.set(name, value);
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: requestHeaders,
      redirect: "follow",
    });
  } catch {
    return poolJson({ error: "The download could not be reached." }, 502);
  }
  if (![200, 206].includes(upstream.status)) return poolJson({ error: "This file is no longer available." }, upstream.status === 404 ? 410 : 502);

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const filename = String(publicFile.name || entry.name || "download");
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  headers.set("content-disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set("cache-control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

const TRANSFER_API_ROUTES = [
  ["POST", /^\/transfer\/upload\/(?:init|parts|complete-multipart|abort|confirm)$/],
  ["POST", /^\/transfer\/collection$/],
  ["POST", /^\/transfer\/collection\/[A-Za-z0-9_-]{9,24}\/(?:ready|expiry|max-downloads)$/],
  ["DELETE", /^\/transfer\/collection\/[A-Za-z0-9_-]{9,24}$/],
  ["POST", /^\/transfer\/file\/[A-Za-z0-9_-]{9,24}\/(?:expiry|max-downloads)$/],
];

async function proxyTransferApi(request, url, env) {
  if (!TRANSFER_API_ROUTES.some(([method, pattern]) => request.method === method && pattern.test(url.pathname))) {
    return poolJson({ success: false, error: "Not found." }, 404);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 128 * 1024) return poolJson({ success: false, error: "Request too large." }, 413);
  const headers = new Headers({
    "content-type": "application/json",
    "accept": "application/json",
    // storage.to's edge security rejects the default server-side fetch user
    // agent on upload initialization. Identify this documented API client.
    "user-agent": "Filzy/1.0 (+https://filzy.site)",
  });
  for (const name of ["x-visitor-token", "authorization", "x-owner-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Authenticated control calls avoid anonymous shared-egress blocking while
  // the browser still uploads file bytes straight to the presigned R2 URL.
  if (env.STORAGE_TO_TOKEN) {
    const owner = request.headers.get("authorization");
    if (owner?.startsWith("Owner ")) headers.set("x-owner-token", owner.slice(6));
    headers.set("authorization", `Bearer ${env.STORAGE_TO_TOKEN}`);
  }
  let response;
  try {
    response = await fetch(`https://storage.to/api${url.pathname.slice("/transfer".length)}`, {
      method: request.method,
      headers,
      body: request.method === "DELETE" ? undefined : await request.text(),
      redirect: "manual",
    });
  } catch {
    return poolJson({ success: false, error: "The upload service could not be reached." }, 502);
  }
  const responseHeaders = new Headers({
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) responseHeaders.set("retry-after", retryAfter);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

function poolJson(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
