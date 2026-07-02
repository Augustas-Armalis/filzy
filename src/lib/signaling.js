/* ============================================================================
   Signaling — brokers the tiny WebRTC handshake (SDP/ICE) between two peers.
   NO file bytes ever pass through here; the actual transfer is pure P2P
   (browser-to-browser, DTLS-encrypted). Three transports behind one interface:

   • BroadcastChannelSignaling — zero infra, same-origin cross-tab (instant).
   • MqttSignaling — a FREE public MQTT broker so two *different devices* can
     find each other. No account, no deploy, no Cloudflare. Only the ~KB
     handshake is relayed; files go direct.
   • WebSocketSignaling — your own signaling endpoint (optional, most reliable)
     enabled when VITE_SIGNAL_URL is set.

   The default (CombinedSignaling) runs BroadcastChannel + MQTT together, so a
   same-browser beam is instant and a cross-device beam still connects.
   ========================================================================== */

const MQTT_BROKER = "wss://broker.emqx.io:8084/mqtt";

class BroadcastChannelSignaling {
  constructor(beamId, selfId) {
    this.selfId = selfId;
    this.cb = null;
    this.ready = Promise.resolve();
    this.bc = new BroadcastChannel(`filzy-beam-${beamId}`);
    this.bc.onmessage = (e) => {
      const env = e.data;
      if (!env || env._from === this.selfId) return; // ignore our own echoes
      this.cb?.(env.msg);
    };
  }
  send(msg) {
    this.bc.postMessage({ _from: this.selfId, msg });
  }
  onMessage(cb) {
    this.cb = cb;
  }
  close() {
    try {
      this.bc.close();
    } catch {
      /* noop */
    }
  }
}

class MqttSignaling {
  constructor(beamId, selfId) {
    this.selfId = selfId;
    this.cb = null;
    this.topic = `filzy/beam/${beamId}`;
    this.queue = [];
    this.up = false;
    this.client = null;
    let resolveReady;
    this.ready = new Promise((r) => (resolveReady = r));
    // Lazy-load mqtt so it never bloats the initial page — only when beaming.
    import("mqtt")
      .then(({ default: mqtt }) => {
        this.client = mqtt.connect(MQTT_BROKER, { reconnectPeriod: 2000, connectTimeout: 8000 });
        this.client.on("connect", () => {
          this.client.subscribe(this.topic, () => {});
          this.up = true;
          for (const m of this.queue) this.pub(m);
          this.queue = [];
          resolveReady();
        });
        this.client.on("message", (_topic, payload) => {
          try {
            const msg = JSON.parse(payload.toString());
            if (msg.from === this.selfId) return; // ignore our own echoes
            this.cb?.(msg);
          } catch {
            /* ignore malformed */
          }
        });
        this.client.on("error", () => {});
      })
      .catch(() => resolveReady()); // don't block if mqtt fails to load
  }
  pub(m) {
    try {
      this.client.publish(this.topic, JSON.stringify(m));
    } catch {
      /* noop */
    }
  }
  send(msg) {
    if (this.up) this.pub(msg);
    else this.queue.push(msg);
  }
  onMessage(cb) {
    this.cb = cb;
  }
  close() {
    try {
      this.client.end(true);
    } catch {
      /* noop */
    }
  }
}

class WebSocketSignaling {
  constructor(url, beamId, selfId) {
    this.selfId = selfId;
    this.cb = null;
    this.queue = [];
    const full = `${url.replace(/\/$/, "")}/beam/${beamId}?self=${encodeURIComponent(selfId)}`;
    this.ws = new WebSocket(full);
    this.ready = new Promise((resolve) => {
      this.ws.onopen = () => {
        for (const m of this.queue) this.ws.send(JSON.stringify(m));
        this.queue = [];
        resolve();
      };
    });
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.from === this.selfId) return;
        this.cb?.(msg);
      } catch {
        /* ignore malformed */
      }
    };
  }
  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }
  onMessage(cb) {
    this.cb = cb;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
  }
}

// Runs BroadcastChannel + MQTT together. Same-browser tabs talk instantly over
// BroadcastChannel; different devices connect via the public broker. Each
// message is tagged so a duplicate arriving on both transports is dropped once.
class CombinedSignaling {
  constructor(beamId, selfId) {
    this.selfId = selfId;
    this.cb = null;
    this.seen = new Set();
    this.seq = 0;
    this.ready = Promise.resolve();
    this.transports = [];
    try {
      this.transports.push(new BroadcastChannelSignaling(beamId, selfId));
    } catch {
      /* BroadcastChannel unavailable */
    }
    try {
      this.transports.push(new MqttSignaling(beamId, selfId));
    } catch {
      /* MQTT unavailable — same-browser still works via BroadcastChannel */
    }
    for (const t of this.transports) {
      t.onMessage((m) => {
        const id = m && m.__id;
        if (id) {
          if (this.seen.has(id)) return;
          this.seen.add(id);
        }
        this.cb?.(m);
      });
    }
  }
  send(msg) {
    const tagged = { ...msg, __id: `${this.selfId}-${++this.seq}` };
    for (const t of this.transports) t.send(tagged);
  }
  onMessage(cb) {
    this.cb = cb;
  }
  close() {
    for (const t of this.transports) t.close();
  }
}

export function createSignaling(beamId, selfId) {
  const url = import.meta.env.VITE_SIGNAL_URL;
  if (url && typeof WebSocket !== "undefined") {
    try {
      return new WebSocketSignaling(url, beamId, selfId);
    } catch {
      /* fall through */
    }
  }
  return new CombinedSignaling(beamId, selfId);
}

/** ICE configuration.

    STUN (free, public) lets two friendly-NAT peers connect directly. That's
    enough for same-Wi-Fi / simple-router beams. But when a peer is on cellular
    or behind a strict/symmetric NAT, WebRTC needs a TURN relay to bounce the
    bytes — without one, the connection just hangs and times out.

    There is NO more zero-signup public TURN (the old openrelay.metered.ca was
    shut down). So TURN is env-driven: paste your own free credentials in and
    they light up. Two ways:

    1. Metered free tier (simplest): set VITE_TURN_USER + VITE_TURN_CRED. We
       expand them across Metered's standard global relay ports (80 UDP, 80 TCP,
       443, and 443/TLS which punches through the most hostile firewalls).
       Override the host with VITE_TURN_HOST if your dashboard shows a different
       one.
    2. Any single custom relay (e.g. Cloudflare later): set VITE_TURN_URL
       (+ USER/CRED). Used as-is, in addition to the above.

    With no TURN env set, beams still work on friendly networks via STUN alone. */
const TURN_HOST = import.meta.env.VITE_TURN_HOST || "global.relay.metered.ca";
const TURN_USER = import.meta.env.VITE_TURN_USER;
const TURN_CRED = import.meta.env.VITE_TURN_CRED;

const meteredTurn =
  TURN_USER && TURN_CRED
    ? [
        `turn:${TURN_HOST}:80`,
        `turn:${TURN_HOST}:80?transport=tcp`,
        `turn:${TURN_HOST}:443`,
        `turns:${TURN_HOST}:443?transport=tcp`,
      ].map((urls) => ({ urls, username: TURN_USER, credential: TURN_CRED }))
    : [];

export const ICE_CONFIG = {
  iceServers: [
    // Bundle several Google STUN endpoints so candidate gathering doesn't stall
    // on a single slow/unreachable server — first to answer wins.
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
    ...meteredTurn,
    ...(import.meta.env.VITE_TURN_URL
      ? [{ urls: import.meta.env.VITE_TURN_URL, username: TURN_USER, credential: TURN_CRED }]
      : []),
  ],
  // Pre-gather a small pool of candidates as soon as the RTCPeerConnection is
  // created, before the offer/answer is built. On the same network the local
  // (host) candidates are ready essentially instantly, so the direct P2P path
  // is nailed up the moment signaling completes instead of after a gather round.
  iceCandidatePoolSize: 4,
};
