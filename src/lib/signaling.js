/* ============================================================================
   Signaling transport — brokers SDP/ICE between peers. No file bytes ever pass
   through here. Two implementations behind one interface:

   • BroadcastChannelSignaling — ZERO infra, same-origin cross-tab. Powers the
     beam between two tabs of filzy.site with real RTCPeerConnections. This is
     the default and needs no server at all.
   • WebSocketSignaling — points at an optional signaling endpoint for true
     cross-device beams. Only used if VITE_SIGNAL_URL is set at build time;
     otherwise it is never touched.
   ========================================================================== */

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

export function createSignaling(beamId, selfId) {
  const url = import.meta.env.VITE_SIGNAL_URL;
  if (url && typeof WebSocket !== "undefined") {
    try {
      return new WebSocketSignaling(url, beamId, selfId);
    } catch {
      /* fall through to local */
    }
  }
  return new BroadcastChannelSignaling(beamId, selfId);
}

/** ICE configuration. Public STUN is enough for same-machine + many home
    networks; an optional TURN relay can be supplied via VITE_TURN_URL. */
export const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(import.meta.env.VITE_TURN_URL
      ? [
          {
            urls: import.meta.env.VITE_TURN_URL,
            username: import.meta.env.VITE_TURN_USER,
            credential: import.meta.env.VITE_TURN_CRED,
          },
        ]
      : []),
  ],
};
