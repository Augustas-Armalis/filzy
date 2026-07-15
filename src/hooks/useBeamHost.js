import { useCallback, useEffect, useRef, useState } from "react";
import { beamId as genBeamId, selfId as genSelfId } from "@/lib/ids";
import { BeamHost } from "@/lib/beam";
import { preventSleep, allowSleep } from "@/lib/wakelock";
import { formatBytes } from "@/lib/files";

// Engine recipient status -> Filzy STATUS map keys (Streaming.jsx).
const STATUS_MAP = {
  reading: "connected",
  extracting: "downloading",
  complete: "downloaded",
  disconnected: "offline",
  paused: "connected",
};

// The "location" slot in a UserRow: live speed while downloading, else a
// connection label. (We don't do geo-IP — that would need a 3rd-party service.)
function locationLabel(r) {
  if (r.region) return r.region; // real geo from the recipient's IP
  if (r.status === "extracting") return `${formatBytes(r.speed || 0)}/s`;
  return "Locating…";
}

// Map one Home item (loose file or folder) to host files. File ids derive from
// the item id so live add/remove can target exactly the right files.
function itemToHostFiles(item) {
  if (item.kind === "folder") {
    return item.files.map((f, idx) => ({
      meta: { id: `i${item.id}-${idx}`, name: `${item.name}/${f.name}`, size: f.size, mime: f.type || "application/octet-stream" },
      file: f,
    }));
  }
  if (!item.file) return [];
  return [
    { meta: { id: `i${item.id}`, name: item.file.name, size: item.file.size, mime: item.file.type || "application/octet-stream" }, file: item.file },
  ];
}

function itemsToHostFiles(items) {
  return items.flatMap(itemToHostFiles);
}

export function useBeamHost() {
  const [recipients, setRecipients] = useState([]);
  const [aggregateSpeed, setAggregateSpeed] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [live, setLive] = useState(false);
  const hostRef = useRef(null);
  const overdriveRef = useRef(false);

  const start = useCallback((items, note) => {
    // No upfront hashing: the channel is reliable + ordered (DTLS/SCTP), and
    // reading huge files just to hash them would defeat streaming.
    const hostFiles = itemsToHostFiles(items);
    if (hostFiles.length === 0) return;
    const totalSize = hostFiles.reduce((a, h) => a + h.meta.size, 0);
    const manifest = {
      files: hostFiles.map((h) => ({ id: h.meta.id, name: h.meta.name, size: h.meta.size, mime: h.meta.mime })),
      message: (note || "").trim() || undefined,
      totalSize,
    };

    const bId = genBeamId();
    const self = genSelfId();
    const host = new BeamHost(bId, self, hostFiles, manifest, {
      onRecipientJoin: (r) => setRecipients((prev) => [...prev.filter((x) => x.id !== r.id), r]),
      onRecipientUpdate: (rid, patch) =>
        setRecipients((prev) => prev.map((x) => (x.id === rid ? { ...x, ...patch } : x))),
      onRecipientLeave: (rid) => setRecipients((prev) => prev.filter((x) => x.id !== rid)),
      onAggregateSpeed: (spd) => setAggregateSpeed(spd),
    });
    if (overdriveRef.current) host.setOverdrive(true);
    hostRef.current = host;

    setShareUrl(`${window.location.origin}/s/${bId}`);
    setLive(true);
    void preventSleep();
  }, []);

  const stop = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    void allowSleep();
    setRecipients([]);
    setAggregateSpeed(0);
    setShareUrl("");
    setLive(false);
  }, []);

  const setOverdrive = useCallback((on) => {
    overdriveRef.current = on;
    hostRef.current?.setOverdrive(on);
  }, []);

  const kick = useCallback((id) => hostRef.current?.kick(id), []);

  // Live add/remove of streamed files while the beam is running.
  const addItems = useCallback((items) => {
    hostRef.current?.addFiles(itemsToHostFiles(items));
  }, []);

  const removeItem = useCallback((item) => {
    const ids = itemToHostFiles(item).map((h) => h.meta.id);
    if (ids.length) hostRef.current?.removeFiles(ids);
  }, []);

  // Flash the tab title while a beam is live.
  useEffect(() => {
    if (!live) return;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? "Streaming…" : "Filzy";
    }, 3000);
    return () => {
      clearInterval(t);
      document.title = "Filzy";
    };
  }, [live]);

  // Tear down a live host if the page unmounts.
  useEffect(
    () => () => {
      hostRef.current?.close();
      void allowSleep();
    },
    [],
  );

  const users = recipients.map((r) => ({
    id: r.id,
    name: "Anonymous",
    status: STATUS_MAP[r.status] || "connected",
    location: locationLabel(r),
    progress: r.progress || 0,
  }));

  return { users, aggregateSpeed, shareUrl, live, start, stop, setOverdrive, kick, addItems, removeItem };
}
