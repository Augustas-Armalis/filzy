/**
 * Filzy — Signaling Worker + BeamRoom Durable Object.
 *
 * Brokers the tiny WebRTC handshake (SDP/ICE) between two peers of a Beam.
 * NO FILE BYTES EVER PASS THROUGH HERE — the transfer is pure peer-to-peer.
 * Each Beam id maps to one Durable Object "room"; peers connect over a
 * WebSocket and the room relays messages, targeted (by `to`) or broadcast.
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
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "*");
  return res;
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
