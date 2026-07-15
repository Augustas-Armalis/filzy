import { createSignaling, getIceConfig } from "./signaling";
import { sha256Hex } from "./hash";

/* ============================================================================
   The Beam engine — real WebRTC data-channel file transfer. Your device IS the
   server. Bytes go peer-to-peer (DTLS-encrypted). Works between two browser
   tabs out of the box (BroadcastChannel signaling) and across devices when a
   signaling URL is configured. Ported from space-send (src/transfer/beam.ts).
   ========================================================================== */

const CHUNK = 512 * 1024; // 512 KB default — clamped per-connection to maxMessageSize
const HIGH_WATER = 12 * 1024 * 1024; // keep up to 12 MB in flight before pausing
const OVERDRIVE_HIGH_WATER = 16 * 1024 * 1024; // overdrive keeps more in flight
const LOW_WATER = 1 * 1024 * 1024;

/* LAN turbo. When the selected ICE path is a direct same-network link (host↔host
   candidates, no relay, sub-millisecond RTT) there's effectively no bandwidth or
   latency ceiling, so we widen the pipe hard: 1 MB messages (clamped to the
   connection's maxMessageSize) and up to 64 MB in flight. That lets SCTP keep the
   local link saturated instead of tip-toeing with the internet-safe defaults.
   Detected automatically per-peer from getStats — never surfaced in the UI. */
const LAN_CHUNK = 1024 * 1024; // 1 MB messages on a local link
const LAN_HIGH_WATER = 64 * 1024 * 1024; // keep up to 64 MB in flight on LAN
const LAN_LOW_WATER = 8 * 1024 * 1024; // refill early so the local pipe never drains
const LAN_RTT_MS = 8; // selected-pair RTT below this ⇒ treat as same-network

function bars(rtt) {
  if (rtt < 40) return 5;
  if (rtt < 90) return 4;
  if (rtt < 160) return 3;
  if (rtt < 300) return 2;
  return 1;
}

export class BeamHost {
  constructor(beamId, selfId, files, manifest, cb = {}) {
    this.beamId = beamId;
    this.selfId = selfId;
    this.files = files;
    this.manifest = manifest;
    this.cb = cb;
    this.peers = new Map();
    this.throttle = 0; // bytes/sec, 0 = unlimited
    this.chunk = CHUNK;
    this.highWater = HIGH_WATER;
    this.closed = false;
    this.timer = null;

    this.sig = createSignaling(beamId, selfId);
    this.sig.onMessage((m) => this.onSignal(m));
    // Announce we're live and invite anyone already waiting. Re-announce a few
    // times: brokers take a moment to connect and a lone hello can be missed if
    // a receiver is still subscribing, which would otherwise deadlock the
    // handshake forever. Cheap (~KB) and stops as soon as someone joins.
    this.announce();
    this.startSpeedLoop();
  }

  announce() {
    let tries = 0;
    const ping = () => {
      if (this.closed || this.peers.size > 0) return;
      this.sig.send({ kind: "hello", beam: this.beamId, from: this.selfId });
      if (++tries < 6) setTimeout(ping, 1500);
    };
    ping();
  }

  setThrottle(bytesPerSec) {
    this.throttle = Math.max(0, bytesPerSec);
  }

  // Overdrive: keep the cap off and widen the pipe (bigger chunks + higher
  // buffered-water mark) so the ordered channel pipelines harder. Honest:
  // it removes the throttle and reduces per-chunk overhead — it cannot beat
  // the network/peer ceiling.
  setOverdrive(on) {
    this.throttle = 0;
    this.highWater = on ? OVERDRIVE_HIGH_WATER : HIGH_WATER;
  }

  // Live add/remove of streamed files — rebroadcasts the manifest to everyone.
  addFiles(hostFiles) {
    for (const hf of hostFiles) {
      if (!this.files.some((f) => f.meta.id === hf.meta.id)) this.files.push(hf);
    }
    this.refreshManifest();
  }

  removeFiles(ids) {
    this.files = this.files.filter((f) => !ids.includes(f.meta.id));
    this.refreshManifest();
  }

  refreshManifest() {
    this.manifest = {
      ...this.manifest,
      files: this.files.map((f) => ({ id: f.meta.id, name: f.meta.name, size: f.meta.size, mime: f.meta.mime })),
      totalSize: this.files.reduce((a, f) => a + f.meta.size, 0),
    };
    this.peers.forEach((p) => {
      if (p.channel && p.channel.readyState === "open") this.sendCtrl(p.channel, { t: "manifest", manifest: this.manifest });
    });
  }

  kick(recipientId) {
    const p = this.peers.get(recipientId);
    if (p) {
      try {
        p.channel?.close();
        p.pc.close();
      } catch {
        /* noop */
      }
      this.peers.delete(recipientId);
      this.cb.onRecipientLeave?.(recipientId);
    }
  }

  async onSignal(m) {
    if (m.beam !== this.beamId) return;
    if (m.kind === "join") {
      await this.createPeer(m.from);
    } else if (m.kind === "answer" && m.to === this.selfId) {
      const p = this.peers.get(m.from);
      if (p) {
        await p.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
        // Remote description is now set — flush any ICE candidates that raced
        // ahead of the answer (they'd otherwise have been dropped and the
        // connection would hang until timeout).
        await this.drainCandidates(p);
      }
    } else if (m.kind === "ice" && m.to === this.selfId) {
      const p = this.peers.get(m.from);
      if (p && m.candidate) await this.addCandidate(p, m.candidate);
    } else if (m.kind === "bye") {
      this.kick(m.from);
    }
  }

  // Add an ICE candidate — but only once the remote description exists. Adding
  // one before setRemoteDescription throws and the candidate is lost, so queue
  // early arrivals and flush them in drainCandidates(). This is the difference
  // between a reliable cross-network connect and a hang-until-timeout.
  async addCandidate(p, candidate) {
    if (!p.pc.remoteDescription) {
      (p.pendingCandidates ||= []).push(candidate);
      return;
    }
    try {
      await p.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      /* candidate no longer applicable */
    }
  }

  async drainCandidates(p) {
    const pending = p.pendingCandidates || [];
    p.pendingCandidates = [];
    for (const c of pending) {
      try {
        await p.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* candidate no longer applicable */
      }
    }
  }

  async createPeer(remoteId) {
    if (this.peers.has(remoteId)) return;
    const pc = new RTCPeerConnection(await getIceConfig());
    const channel = pc.createDataChannel("beam", { ordered: true });
    channel.binaryType = "arraybuffer";

    const recipient = {
      id: remoteId,
      signal: 4,
      progress: 0,
      speed: 0,
      status: "reading",
      startedAt: Date.now(),
    };
    const state = { pc, channel, recipient, lastBytes: 0, lastTime: Date.now() };
    this.peers.set(remoteId, state);
    this.cb.onRecipientJoin?.(recipient);

    pc.onicecandidate = (e) => {
      if (e.candidate)
        this.sig.send({
          kind: "ice",
          beam: this.beamId,
          from: this.selfId,
          to: remoteId,
          candidate: e.candidate.toJSON(),
        });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.cb.onRecipientUpdate?.(remoteId, { status: "disconnected" });
      }
    };
    channel.onopen = () => {
      this.cb.onSpark?.(remoteId);
      this.sendCtrl(channel, { t: "manifest", manifest: this.manifest });
    };
    channel.onmessage = (e) => this.onChannelMsg(remoteId, e.data);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sig.send({ kind: "offer", beam: this.beamId, from: this.selfId, to: remoteId, sdp: offer });
  }

  onChannelMsg(remoteId, data) {
    if (typeof data !== "string") return;
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const p = this.peers.get(remoteId);
    if (!p) return;
    if (msg.t === "extract") {
      p.recipient.status = "extracting";
      this.cb.onRecipientUpdate?.(remoteId, { status: "extracting", startedAt: Date.now() });
      void this.streamTo(remoteId, msg.fileIds);
    } else if (msg.t === "progress") {
      const total = this.manifest.totalSize || 1;
      const frac = Math.min(1, msg.received / total);
      const now = Date.now();
      const dt = (now - p.lastTime) / 1000;
      const speed = dt > 0 ? (msg.received - p.lastBytes) / dt : p.recipient.speed;
      p.lastBytes = msg.received;
      p.lastTime = now;
      p.lastProgressAt = now;
      p.recipient.progress = frac;
      p.recipient.speed = speed > 0 ? speed : p.recipient.speed;
      this.cb.onRecipientUpdate?.(remoteId, { progress: frac, speed: p.recipient.speed });
    } else if (msg.t === "complete") {
      p.recipient.status = "complete";
      p.recipient.progress = 1;
      p.recipient.speed = 0;
      p.recipient.completedAt = Date.now();
      this.cb.onRecipientUpdate?.(remoteId, { status: "complete", progress: 1, speed: 0, completedAt: Date.now() });
    } else if (msg.t === "meta") {
      if (msg.region) {
        p.recipient.region = msg.region;
        this.cb.onRecipientUpdate?.(remoteId, { region: msg.region });
      }
    }
  }

  sendCtrl(channel, msg) {
    try {
      channel.send(JSON.stringify(msg));
    } catch {
      /* channel closing */
    }
  }

  async streamTo(remoteId, fileIds) {
    const p = this.peers.get(remoteId);
    if (!p || !p.channel) return;
    const channel = p.channel;
    channel.bufferedAmountLowThreshold = p.turbo ? LAN_LOW_WATER : LOW_WATER;
    // Don't exceed what this connection actually allows per message.
    const maxMsg = p.pc.sctp?.maxMessageSize;
    const cap = maxMsg && maxMsg > 0 ? maxMsg : Infinity;
    // Chunk/high-water are read fresh each iteration so that LAN turbo — which is
    // detected asynchronously by the speed loop — can widen the pipe mid-transfer.
    const chunkFor = () => Math.min(p.turbo ? LAN_CHUNK : this.chunk, cap);
    const highWaterFor = () => (p.turbo ? Math.max(this.highWater, LAN_HIGH_WATER) : this.highWater);
    const wanted = this.files.filter((f) => fileIds.includes(f.meta.id));

    for (const { meta, file } of wanted) {
      if (this.closed) return;
      this.sendCtrl(channel, { t: "file-begin", id: meta.id, name: meta.name, size: meta.size, mime: meta.mime });
      let offset = 0;
      // Prefetch the next chunk while the current is in flight — overlaps the
      // disk read with the network send so the channel never sits idle.
      let next = file.size > 0 ? file.slice(0, Math.min(chunkFor(), file.size)).arrayBuffer() : null;
      while (offset < file.size) {
        if (this.closed || channel.readyState !== "open") return;
        const buf = await next;
        const nextOffset = offset + buf.byteLength;
        const c = chunkFor();
        next = nextOffset < file.size ? file.slice(nextOffset, Math.min(nextOffset + c, file.size)).arrayBuffer() : null;
        if (channel.bufferedAmount > highWaterFor()) await this.waitDrain(channel);
        try {
          channel.send(buf);
        } catch {
          return;
        }
        offset = nextOffset;
      }
      this.sendCtrl(channel, { t: "file-end", id: meta.id, hash: meta.hash });
    }
  }

  waitDrain(channel) {
    return new Promise((resolve) => {
      const handler = () => {
        channel.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      channel.addEventListener("bufferedamountlow", handler);
    });
  }

  // Decide whether the selected ICE candidate-pair is a direct same-network link
  // and, if so, flip this peer into LAN turbo. A local link is one that is not
  // relayed (neither end is a TURN "relay" candidate) and is either host↔host
  // (or peer-reflexive, which host candidates present as behind a local router)
  // or has a sub-millisecond round-trip. streamTo reads p.turbo live, so the pipe
  // widens on the very next chunk. Silent by design — no UI signal.
  maybeTurbo(p, pair, cands) {
    const local = cands.get(pair.localCandidateId);
    const remote = cands.get(pair.remoteCandidateId);
    const rttMs = pair.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null;
    const notRelay = (c) => c && c.candidateType !== "relay";
    const localish = (c) => c && (c.candidateType === "host" || c.candidateType === "prflx");
    const direct = notRelay(local) && notRelay(remote);
    if (!direct) return;
    const sameNetwork = (localish(local) && localish(remote)) || (rttMs != null && rttMs < LAN_RTT_MS);
    if (!sameNetwork) return;
    p.turbo = true;
    if (p.channel && p.channel.readyState === "open") {
      try {
        p.channel.bufferedAmountLowThreshold = LAN_LOW_WATER;
      } catch {
        /* channel closing */
      }
    }
  }

  startSpeedLoop() {
    const tick = () => {
      if (this.closed) return;
      let agg = 0;
      this.peers.forEach((p) => {
        // No fresh progress for a moment → this peer isn't transferring; zero it
        // so the speed readout drops instead of sticking on a stale value.
        const stale = Date.now() - (p.lastProgressAt || 0) > 1500;
        if (stale && p.recipient.speed) {
          p.recipient.speed = 0;
          this.cb.onRecipientUpdate?.(p.recipient.id, { speed: 0 });
        }
        if (p.recipient.status === "extracting" && !stale) agg += p.recipient.speed;
        // Refresh signal from RTT, and sniff the selected ICE path for a
        // same-network link so we can flip on LAN turbo (never shown in the UI).
        p.pc.getStats?.().then((stats) => {
          const cands = new Map();
          let pair = null;
          stats.forEach((report) => {
            if (report.type === "local-candidate" || report.type === "remote-candidate") cands.set(report.id, report);
            if (report.type === "candidate-pair" && report.state === "succeeded" && (report.nominated || report.selected)) pair = report;
            if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) {
              const b = bars(report.currentRoundTripTime * 1000);
              if (b !== p.recipient.signal) {
                p.recipient.signal = b;
                this.cb.onRecipientUpdate?.(p.recipient.id, { signal: b });
              }
            }
          });
          if (pair && !p.turbo) this.maybeTurbo(p, pair, cands);
        });
      });
      this.cb.onAggregateSpeed?.(agg);
      this.timer = setTimeout(tick, 1000);
    };
    this.timer = setTimeout(tick, 1000);
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      this.sig.send({ kind: "bye", beam: this.beamId, from: this.selfId });
    } catch {
      /* noop */
    }
    this.peers.forEach((p) => {
      try {
        p.channel?.close();
        p.pc.close();
      } catch {
        /* noop */
      }
    });
    this.peers.clear();
    setTimeout(() => this.sig.close(), 0); // let "bye" flush before tearing down signaling
  }
}

/* ---------------------------------------------------------------------------- */

export class BeamReceiver {
  constructor(beamId, selfId, cb = {}) {
    this.beamId = beamId;
    this.selfId = selfId;
    this.cb = cb;
    this.channel = null;
    this.incoming = new Map();
    this.current = null;
    this.manifest = null;
    this.totalReceived = 0;
    this.lastBytes = 0;
    this.lastTime = Date.now();
    this.progressTimer = null;
    this.hostId = null;
    this.closed = false;
    this._lastSpeed = 0;
    this.sinks = new Map(); // fileId -> writable stream (progressive save-to-disk)
    this.pendingCandidates = []; // ICE that arrived before the offer's SDP was set

    this.sig = createSignaling(beamId, selfId);
    this.cb.onConnecting?.();
    // The ICE config is fetched async (it pulls short-lived Cloudflare TURN
    // creds), so the peer connection is built in init(). Signals are only wired
    // once pc exists, so an early offer can't race ahead of it.
    this.ready = this.init();
  }

  async init() {
    this.pc = new RTCPeerConnection(await getIceConfig());
    this.wirePc();
    this.sig.onMessage((m) => this.onSignal(m));
    await this.sig.ready;
    // Announce presence; host will offer. Retry a few times: transports take a
    // moment to connect and the host may not be subscribed at the instant we
    // first join, which would otherwise leave us stuck on "Connecting…". Stops
    // the moment the data channel is open.
    this.announce();
  }

  announce() {
    let tries = 0;
    const ping = () => {
      if (this.closed || (this.channel && this.channel.readyState === "open")) return;
      this.sig.send({ kind: "join", beam: this.beamId, from: this.selfId });
      if (++tries < 8) setTimeout(ping, 1500);
    };
    ping();
  }

  wirePc() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.hostId)
        this.sig.send({
          kind: "ice",
          beam: this.beamId,
          from: this.selfId,
          to: this.hostId,
          candidate: e.candidate.toJSON(),
        });
    };
    this.pc.ondatachannel = (e) => {
      this.channel = e.channel;
      this.channel.binaryType = "arraybuffer";
      this.channel.onopen = () => {
        this.cb.onConnected?.();
        this.send({ t: "ready" });
        this.startProgressLoop();
        void this.reportRegion();
      };
      this.channel.onmessage = (ev) => this.onData(ev.data);
      this.channel.onclose = () => {
        if (!this.closed && this.manifest && this.totalReceived < (this.manifest.totalSize || 1)) {
          this.cb.onSevered?.(this.totalReceived / (this.manifest.totalSize || 1));
        }
      };
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed") this.cb.onError?.(new Error("Beam severed"));
    };
  }

  async onSignal(m) {
    if (m.beam !== this.beamId) return;
    if (m.kind === "hello") {
      // Host came online after us — re-announce.
      this.sig.send({ kind: "join", beam: this.beamId, from: this.selfId });
    } else if (m.kind === "offer" && (m.to === this.selfId || !m.to)) {
      // Ignore a duplicate/second offer once we're already handshaking with a
      // host (the host re-announces, and offers can arrive via several brokers).
      if (this.hostId && this.pc.remoteDescription) return;
      this.hostId = m.from;
      await this.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sig.send({ kind: "answer", beam: this.beamId, from: this.selfId, to: m.from, sdp: answer });
      // SDP is set — flush any ICE that arrived ahead of the offer.
      await this.drainCandidates();
    } else if (m.kind === "ice" && m.to === this.selfId) {
      if (m.candidate) await this.addCandidate(m.candidate);
    } else if (m.kind === "bye") {
      if (!this.closed) this.cb.onError?.(new Error("Host left"));
    }
  }

  // Same early-arrival guard as the host: queue ICE until the offer's remote
  // description is in place, then flush — otherwise the connection can silently
  // lose candidates and never leave "Connecting…".
  async addCandidate(candidate) {
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      /* candidate no longer applicable */
    }
  }

  async drainCandidates() {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of pending) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* candidate no longer applicable */
      }
    }
  }

  send(msg) {
    if (this.channel && this.channel.readyState === "open") {
      try {
        this.channel.send(JSON.stringify(msg));
      } catch {
        /* noop */
      }
    }
  }

  // Register a writable stream so this file streams to disk as it arrives
  // (progressive download) instead of being buffered into a Blob.
  setSink(fileId, writable) {
    this.sinks.set(fileId, writable);
  }

  startExtract(fileIds) {
    this.send({ t: "extract", fileIds });
  }

  onData(data) {
    if (typeof data === "string") {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.t === "manifest") {
        this.manifest = msg.manifest;
        this.cb.onManifest?.(msg.manifest);
      } else if (msg.t === "file-begin") {
        this.current = {
          id: msg.id,
          name: msg.name,
          size: msg.size,
          mime: msg.mime,
          received: 0,
          chunks: [],
          sink: this.sinks.get(msg.id) || null,
        };
        this.incoming.set(msg.id, this.current);
      } else if (msg.t === "file-end") {
        void this.finishFile(msg.id, msg.hash);
      } else if (msg.t === "signal") {
        this.cb.onSignal?.(msg.bars);
      }
      return;
    }
    // Binary chunk
    if (!this.current) return;
    const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!buf) return;
    this.current.received += buf.byteLength;
    this.totalReceived += buf.byteLength;
    if (this.current.sink) {
      try {
        this.current.sink.write(buf); // streams to disk; close() flushes on file-end
      } catch {
        /* sink closing */
      }
    } else {
      this.current.chunks.push(buf);
    }
    this.cb.onFileProgress?.(this.current.id, this.current.received, this.current.size, this.instSpeed());
  }

  instSpeed() {
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    if (dt < 0.25) return this._lastSpeed;
    const speed = (this.totalReceived - this.lastBytes) / dt;
    this.lastBytes = this.totalReceived;
    this.lastTime = now;
    this._lastSpeed = speed * 0.4 + this._lastSpeed * 0.6; // EMA
    return this._lastSpeed;
  }

  async finishFile(id, expectedHash) {
    const f = this.incoming.get(id);
    if (!f) return;
    if (f.sink) {
      // Streamed straight to disk — flush + close, no Blob in memory.
      try {
        await f.sink.close();
      } catch {
        /* noop */
      }
      this.sinks.delete(id);
      f.chunks = [];
      this.cb.onFileComplete?.(id, null, true);
    } else {
      const blob = new Blob(f.chunks, { type: f.mime });
      let verified = true;
      if (expectedHash) {
        try {
          const got = await sha256Hex(await blob.arrayBuffer());
          verified = got === expectedHash;
        } catch {
          verified = false;
        }
      }
      f.chunks = []; // free memory
      this.cb.onFileComplete?.(id, blob, verified);
    }
    this.current = null;
    // All done?
    if (this.manifest && this.incoming.size >= this.manifest.files.length) {
      const allDone = this.manifest.files.every((mf) => {
        const inc = this.incoming.get(mf.id);
        return inc && inc.received >= inc.size;
      });
      if (allDone) {
        this.send({ t: "complete" });
        this.cb.onAllComplete?.();
        this.stopProgressLoop();
      }
    }
  }

  // Best-effort geo from a free IP API, shared with the host so it can show
  // roughly where each recipient is (like space-send). Fails silently.
  async reportRegion() {
    try {
      const res = await fetch("https://ipwho.is/");
      const d = await res.json();
      if (d && d.success !== false) {
        const region = [d.city, d.country_code].filter(Boolean).join(", ");
        if (region) this.send({ t: "meta", region });
      }
    } catch {
      /* offline / blocked — no region shown */
    }
  }

  startProgressLoop() {
    // Bilateral telemetry: report received bytes to the host at 4 Hz.
    this.progressTimer = setInterval(() => {
      if (this.current) this.send({ t: "progress", id: this.current.id, received: this.totalReceived });
    }, 250);
  }
  stopProgressLoop() {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  close() {
    this.closed = true;
    this.stopProgressLoop();
    try {
      this.channel?.close();
      this.pc?.close();
    } catch {
      /* noop */
    }
    try {
      this.sig.send({ kind: "bye", beam: this.beamId, from: this.selfId });
    } catch {
      /* noop */
    }
    setTimeout(() => this.sig.close(), 0); // let "bye" flush before tearing down signaling
  }
}
