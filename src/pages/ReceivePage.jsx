import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Receive, DownloadStarted, ReceiveStatusCard } from "@/components/Streaming";
import { BeamReceiver } from "@/lib/beam";
import { selfId as genSelfId } from "@/lib/ids";
import { kindOf } from "@/lib/files";
import { zipSync, downloadBlob } from "@/lib/zip";
import { preventSleep, allowSleep } from "@/lib/wakelock";
import { useSeo } from "@/lib/seo";

/*
  The recipient. Opens filzy.site/s/<beamId>, connects to the sender over
  WebRTC, shows the advertised files, and downloads them for real (single file
  or a zip of all). Extractions are queued one at a time because the data
  channel streams files sequentially.
*/
export default function ReceivePage() {
  const { id } = useParams();
  useSeo({
    title: "Receive a Filzy Beam",
    description: "Receive files from a live Filzy Beam.",
    path: id ? `/s/${id}` : "/s",
    robots: "noindex, nofollow",
  });
  const [phase, setPhase] = useState("connecting"); // connecting | ready | done | error
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState({}); // id -> "downloading" | "done"
  const [progress, setProgress] = useState({}); // id -> 0..1
  const [speed, setSpeed] = useState(0); // live receive speed, bytes/sec
  const [allBusy, setAllBusy] = useState(false);

  const rxRef = useRef(null);
  const blobs = useRef(new Map());
  const filesRef = useRef([]);
  const queue = useRef([]);
  const active = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!id) return;

    // Fresh slate for this beam id (covers navigating between links in one tab).
    setPhase("connecting");
    setFiles([]);
    setNote("");
    setStatus({});
    setProgress({});
    setSpeed(0);
    setAllBusy(false);
    blobs.current = new Map();
    filesRef.current = [];
    queue.current = [];
    active.current = null;

    const nameOf = (fid) => filesRef.current.find((f) => f.id === fid)?.name || "file";

    const pump = () => {
      if (active.current || queue.current.length === 0) return;
      const job = queue.current.shift();
      active.current = job;
      if (job.mode === "all") setAllBusy(true);
      rxRef.current?.startExtract(job.ids);
    };

    const finishJob = async (job) => {
      if (job.mode === "all") {
        const entries = [];
        for (const fid of job.ids) {
          const b = blobs.current.get(fid);
          if (b) entries.push({ name: nameOf(fid), bytes: new Uint8Array(await b.arrayBuffer()) });
        }
        downloadBlob("filzy-files.zip", zipSync(entries));
        setAllBusy(false);
        // The card stayed visible with live progress the whole time; onAllComplete
        // flips to the celebratory "done" screen once every byte has landed.
      } else if (job.mode === "single") {
        const b = blobs.current.get(job.ids[0]);
        if (b) downloadBlob(nameOf(job.ids[0]), b);
      }
      // "stream" mode: already written to disk by the receiver — nothing to save.
      active.current = null;
      pump();
    };

    const self = genSelfId();
    const rx = new BeamReceiver(id, self, {
      onManifest: (m) => {
        const mapped = m.files.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          mime: f.mime,
          kind: kindOf({ type: f.mime, name: f.name }),
        }));
        filesRef.current = mapped;
        setFiles(mapped);
        setNote(m.message || "");
        setPhase("ready");
      },
      onFileProgress: (fid, received, total, spd) => {
        setStatus((s) => (s[fid] === "done" ? s : { ...s, [fid]: "downloading" }));
        setProgress((p) => ({ ...p, [fid]: total ? Math.min(1, received / total) : 0 }));
        if (typeof spd === "number" && spd > 0) setSpeed(spd);
      },
      onFileComplete: (fid, blob) => {
        if (blob) blobs.current.set(fid, blob); // null when streamed straight to disk
        setStatus((s) => ({ ...s, [fid]: "done" }));
        setProgress((p) => ({ ...p, [fid]: 1 }));
        const job = active.current;
        if (job && job.ids.includes(fid)) {
          job.done.add(fid);
          if (job.done.size >= job.ids.length) void finishJob(job);
        }
      },
      // Every advertised file has arrived — drop the speed readout and show the
      // celebratory "done" screen (a legitimate end state, not the old premature
      // jump that hid all progress mid-transfer).
      onAllComplete: () => {
        setSpeed(0);
        setPhase((p) => (p === "error" || p === "interrupted" ? p : "done"));
      },
      onError: () => setPhase("error"),
      onSevered: () => setPhase((p) => (p === "done" ? p : "interrupted")),
    });
    rxRef.current = rx;

    // expose the queue pump for the render-scope handlers
    rxRef.current._pump = pump;

    // If we can't reach the sender in time, surface a retry-able message.
    const timeoutId = setTimeout(() => setPhase((p) => (p === "connecting" ? "timeout" : p)), 12000);

    // Keep the screen awake while connected (the most a browser can do — true
    // background transfer with the tab closed isn't possible without a native app).
    void preventSleep();

    return () => {
      clearTimeout(timeoutId);
      rx.close();
      queue.current = [];
      active.current = null;
      void allowSleep();
    };
  }, [id]);

  const downloadOne = async (fid) => {
    if (statusRef.current[fid] === "downloading") return; // already in flight / queued
    void preventSleep(); // user gesture — reliably grabs the wake lock
    const f = filesRef.current.find((x) => x.id === fid);
    let mode = "single";
    // Progressive save-to-disk where supported (Chromium): the browser writes the
    // file as bytes arrive instead of buffering then saving instantly at the end.
    if (f && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: f.name });
        const writable = await handle.createWritable();
        rxRef.current?.setSink(fid, writable);
        mode = "stream";
      } catch (e) {
        if (e && e.name === "AbortError") return; // user canceled the save dialog
        // otherwise fall back to the buffered download below
      }
    }
    setStatus((s) => ({ ...s, [fid]: "downloading" })); // mark now so several can run at once
    queue.current.push({ ids: [fid], mode, done: new Set() });
    rxRef.current?._pump?.();
  };
  const downloadAll = () => {
    if (filesRef.current.length === 0) return;
    // Stay on the receive card so the user watches real progress (overall bar +
    // speed + per-file bars) instead of the old stuck "Download started" screen.
    setAllBusy(true);
    queue.current.push({ ids: filesRef.current.map((f) => f.id), mode: "all", done: new Set() });
    rxRef.current?._pump?.();
  };

  return (
    <div className="flex flex-1 items-center justify-center px-[10px] pt-[60px] pb-[44px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
      {phase === "done" ? (
        <DownloadStarted />
      ) : phase === "ready" ? (
        <Receive
          note={note}
          files={files}
          status={status}
          progress={progress}
          speed={speed}
          allBusy={allBusy}
          onDownloadOne={downloadOne}
          onDownloadAll={downloadAll}
        />
      ) : (
        <ReceiveStatusCard variant={phase} onRetry={() => window.location.reload()} />
      )}
    </div>
  );
}
