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

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/" || url.pathname === "/health") {
      return cors(json({ ok: true, service: "filzy-signaling" }));
    }
    if (url.pathname === "/turn") return cors(await turnCreds(env));
    if (url.pathname.startsWith("/transfer/")) return cors(await proxyTransferApi(request, url));

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
    const action = (url.pathname.match(/^\/pool\/[^/]+(?:\/(init|batches|close))?$/) || [])[1] || "read";
    const state = await this.ctx.storage.get("pool");
    if (["GET", "HEAD"].includes(request.method) && fileMatch) {
      if (!state) return poolJson({ error: "Pool not found." }, 404);
      if (state.expiresAt <= Date.now()) return poolJson({ error: "This pool has expired." }, 410);
      const batch = state.batches.find((candidate) => candidate.id === fileMatch[1]);
      if (!batch) return poolJson({ error: "File not found." }, 404);
      return proxyTransferFile(request, batch.access, Number(fileMatch[2]), batch.files);
    }
    if (request.method === "GET" && action === "read") {
      if (!state) return poolJson({ error: "Pool not found." }, 404);
      if (state.expiresAt <= Date.now()) {
        await this.ctx.storage.deleteAll();
        return poolJson({ error: "This pool has expired." }, 410);
      }
      return poolJson(publicPool(state));
    }

    if (request.method !== "POST") return poolJson({ error: "Method not allowed." }, 405);
    const body = await safePoolJson(request);
    if (!body) return poolJson({ error: "Invalid pool request." }, 400);

    if (action === "init") {
      if (state) return poolJson({ error: "Pool already exists." }, 409);
      const days = Number(body.expiresInDays);
      if (![1, 7, 15, 30].includes(days) || !validSecret(body.ownerSecret)) return poolJson({ error: "Invalid pool settings." }, 400);
      const pool = {
        name: cleanPoolText(body.name, 80) || "Shared pool",
        ownerHash: await hashSecret(body.ownerSecret),
        createdAt: Date.now(),
        expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
        closed: false,
        batches: [],
      };
      await this.ctx.storage.put("pool", pool);
      await this.ctx.storage.setAlarm(pool.expiresAt);
      return poolJson(publicPool(pool), 201);
    }

    if (!state) return poolJson({ error: "Pool not found." }, 404);
    if (state.expiresAt <= Date.now()) return poolJson({ error: "This pool has expired." }, 410);
    if (action === "close") {
      if (!validSecret(body.ownerSecret) || await hashSecret(body.ownerSecret) !== state.ownerHash) return poolJson({ error: "Only the pool owner can close it." }, 403);
      state.closed = true;
      await this.ctx.storage.put("pool", state);
      return poolJson(publicPool(state));
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
      if (state.batches.some((batch) => batch.transferId === transferId)) return poolJson(publicPool(state));
      state.batches.push({
        id: crypto.randomUUID(),
        transferId,
        createdAt: Date.now(),
        files,
        access,
      });
      state.batches = state.batches.slice(-100);
      await this.ctx.storage.put("pool", state);
      return poolJson(publicPool(state), 201);
    }
    return poolJson({ error: "Not found." }, 404);
  }

  async dropRequest(request, url) {
    const state = await this.ctx.storage.get("drop");
    const fileMatch = url.pathname.match(/^\/drop\/[^/]+\/files\/(\d+)$/);
    if (["GET", "HEAD"].includes(request.method) && fileMatch) {
      if (!state) return poolJson({ error: "Transfer not found." }, 404);
      if (state.expiresAt <= Date.now()) return poolJson({ error: "This transfer has expired." }, 410);
      return proxyTransferFile(request, state.access, Number(fileMatch[1]), state.files);
    }
    if (request.method === "GET") {
      if (!state) return poolJson({ error: "Transfer not found." }, 404);
      if (state.expiresAt <= Date.now()) {
        await this.ctx.storage.deleteAll();
        return poolJson({ error: "This transfer has expired." }, 410);
      }
      return poolJson(publicDrop(state));
    }
    if (request.method !== "POST") return poolJson({ error: "Method not allowed." }, 405);
    if (state) return poolJson({ error: "Transfer already exists." }, 409);
    const body = await safePoolJson(request);
    const days = Number(body?.expiresInDays);
    const transferId = String(body?.transferId || "");
    const files = Array.isArray(body?.files) ? body.files.slice(0, 500).map((file) => ({
      name: cleanPoolText(file?.name, 220) || "file",
      size: Math.max(0, Math.min(Number(file?.size) || 0, 50 * 1024 ** 3)),
      kind: cleanPoolText(file?.kind, 80),
    })) : [];
    const access = cleanTransferAccess(body?.access, files);
    if (![1, 7, 15, 30].includes(days) || !/^[A-Za-z0-9_-]+$/.test(transferId) || files.length < 1 || !access) {
      return poolJson({ error: "Invalid transfer metadata." }, 400);
    }
    const drop = {
      note: cleanPoolText(body.note, 100),
      transferId,
      files,
      access,
      createdAt: Date.now(),
      expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
    };
    await this.ctx.storage.put("drop", drop);
    await this.ctx.storage.setAlarm(drop.expiresAt);
    return poolJson(publicDrop(drop), 201);
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

function validSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,120}$/.test(value);
}

function cleanPoolText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
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

function publicPool(pool) {
  return {
    name: pool.name,
    createdAt: pool.createdAt,
    expiresAt: pool.expiresAt,
    closed: pool.closed,
    batches: pool.batches.map(({ access, ...batch }) => batch),
  };
}

function publicDrop(drop) {
  const { access, ...value } = drop;
  return value;
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
  ["POST", /^\/transfer\/collection\/[A-Za-z0-9_-]{9,24}\/(?:ready|expiry)$/],
  ["DELETE", /^\/transfer\/collection\/[A-Za-z0-9_-]{9,24}$/],
  ["POST", /^\/transfer\/file\/[A-Za-z0-9_-]{9,24}\/expiry$/],
];

async function proxyTransferApi(request, url) {
  if (!TRANSFER_API_ROUTES.some(([method, pattern]) => request.method === method && pattern.test(url.pathname))) {
    return poolJson({ success: false, error: "Not found." }, 404);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 128 * 1024) return poolJson({ success: false, error: "Request too large." }, 413);
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["x-visitor-token", "authorization", "x-owner-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
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
