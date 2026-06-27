import { createSignaling, ICE_CONFIG } from "./signaling";
import { sha256Hex } from "./hash";

/* ============================================================================
   The Beam engine — real WebRTC data-channel file transfer. Your device IS the
   server. Bytes go peer-to-peer (DTLS-encrypted). Works between two browser
   tabs out of the box (BroadcastChannel signaling) and across devices when a
   signaling URL is configured. Ported from space-send (src/transfer/beam.ts).
   ========================================================================== */

const CHUNK = 256 * 1024; // 256 KB default — clamped per-connection to maxMessageSize
const HIGH_WATER = 8 * 1024 * 1024; // keep up to 8 MB in flight before pausing
const OVERDRIVE_HIGH_WATER = 16 * 1024 * 1024; // overdrive keeps more in flight
const LOW_WATER = 1 * 1024 * 1024;

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
    // Announce we're live and invite anyone already waiting.
    this.sig.send({ kind: "hello", beam: beamId, from: selfId });
    this.startSpeedLoop();
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
      if (p) await p.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
    } else if (m.kind === "ice" && m.to === this.selfId) {
      const p = this.peers.get(m.from);
      if (p && m.candidate) {
        try {
          await p.pc.addIceCandidate(new RTCIceCandidate(m.candidate));
        } catch {
          /* ignore late candidates */
        }
      }
    } else if (m.kind === "bye") {
      this.kick(m.from);
    }
  }

  async createPeer(remoteId) {
    if (this.peers.has(remoteId)) return;
    const pc = new RTCPeerConnection(ICE_CONFIG);
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
    channel.bufferedAmountLowThreshold = LOW_WATER;
    // Don't exceed what this connection actually allows per message.
    const maxMsg = p.pc.sctp?.maxMessageSize;
    const chunk = maxMsg && maxMsg > 0 ? Math.min(this.chunk, maxMsg) : this.chunk;
    const wanted = this.files.filter((f) => fileIds.includes(f.meta.id));

    for (const { meta, file } of wanted) {
      if (this.closed) return;
      this.sendCtrl(channel, { t: "file-begin", id: meta.id, name: meta.name, size: meta.size, mime: meta.mime });
      let offset = 0;
      // Prefetch the next chunk while the current is in flight — overlaps the
      // disk read with the network send so the channel never sits idle.
      let next = file.size > 0 ? file.slice(0, Math.min(chunk, file.size)).arrayBuffer() : null;
      while (offset < file.size) {
        if (this.closed || channel.readyState !== "open") return;
        const buf = await next;
        const nextOffset = offset + buf.byteLength;
        next = nextOffset < file.size ? file.slice(nextOffset, Math.min(nextOffset + chunk, file.size)).arrayBuffer() : null;
        if (channel.bufferedAmount > this.highWater) await this.waitDrain(channel);
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
        // Refresh signal from RTT when available.
        p.pc.getStats?.().then((stats) => {
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) {
              const b = bars(report.currentRoundTripTime * 1000);
              if (b !== p.recipient.signal) {
                p.recipient.signal = b;
                this.cb.onRecipientUpdate?.(p.recipient.id, { signal: b });
              }
            }
          });
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

    this.sig = createSignaling(beamId, selfId);
    this.pc = new RTCPeerConnection(ICE_CONFIG);
    this.cb.onConnecting?.();
    this.wirePc();
    this.sig.onMessage((m) => this.onSignal(m));
    // Announce presence; host will offer.
    void this.sig.ready.then(() => {
      this.sig.send({ kind: "join", beam: beamId, from: selfId });
    });
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
      this.hostId = m.from;
      await this.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sig.send({ kind: "answer", beam: this.beamId, from: this.selfId, to: m.from, sdp: answer });
    } else if (m.kind === "ice" && m.to === this.selfId) {
      if (m.candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(m.candidate));
        } catch {
          /* ignore */
        }
      }
    } else if (m.kind === "bye") {
      if (!this.closed) this.cb.onError?.(new Error("Host left"));
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
      this.pc.close();
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
