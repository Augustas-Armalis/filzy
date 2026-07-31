import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, Plus, Radio, WavesLadder } from "lucide-react";
import { useLocation } from "react-router-dom";
import { DropBox, FileList } from "@/components/BeamUpload";
import { Streaming, StreamStopped } from "@/components/Streaming";
import { ExpirySelect, TransferFileList, TransferProgress, TransferSuccess } from "@/components/TransferUI";
import { CtaButton, Dropzone, TabBar } from "@/components/ui";
import { basePages, seoPageForPath } from "@/content/seoCatalog";
import { useBeamHost } from "@/hooks/useBeamHost";
import { gatherDropItems, kindOf } from "@/lib/files";
import { pageJsonLd, useSeo } from "@/lib/seo";
import { addPoolTransfer, createPool, poolShareUrl } from "@/lib/pools";
import { createDropShare } from "@/lib/drops";
import { cancelTransferJob, startHostedTransfer, waitForHostedTransfer } from "@/lib/transferCompanion";

const TABS = [
  { id: "drop", label: "Drop", Icon: Cloud },
  { id: "beam", label: "Beam", Icon: Radio },
  { id: "pool", label: "Pool", Icon: WavesLadder },
];

const phaseSwap = {
  initial: { opacity: 0, filter: "blur(12px)", y: 4 },
  animate: { opacity: 1, filter: "blur(0px)", y: 0, transitionEnd: { filter: "none" } },
  exit: { opacity: 0, filter: "blur(12px)", y: -3 },
  transition: { duration: 0.28, ease: "easeInOut" },
};

let uid = 0;
function toItems(gathered) {
  return gathered.map((entry) => {
    if (entry.type === "folder") {
      const size = entry.files.reduce((sum, file) => sum + file.size, 0);
      return { id: ++uid, kind: "folder", name: entry.name, fileCount: entry.files.length, size, files: entry.files };
    }
    const kind = kindOf(entry.file);
    const url = kind === "image" || kind === "video" ? URL.createObjectURL(entry.file) : null;
    return { id: ++uid, kind, file: entry.file, url };
  });
}

function intentForPath(pathname) {
  const value = pathname.match(/^\/send\/(drop|beam|pool)/)?.[1];
  return value || "drop";
}

export default function Home() {
  const location = useLocation();
  const seoPage = seoPageForPath(location.pathname) || basePages[0];
  const [activeId, setActiveId] = useState(() => intentForPath(location.pathname));
  const [phase, setPhase] = useState("upload");
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [poolName, setPoolName] = useState("");
  const [expiry, setExpiry] = useState(7);
  const [isDragging, setIsDragging] = useState(false);
  const [cardHeight, setCardHeight] = useState();
  const [transfer, setTransfer] = useState({ state: "", localProgress: 0, transferProgress: 0, error: "", jobId: "", shareUrl: "" });
  const dragDepth = useRef(0);
  const inputRef = useRef(null);
  const innerRef = useRef(null);
  const abortRef = useRef(null);
  const beam = useBeamHost();
  const phaseRef = useRef(phase);
  const itemsRef = useRef(items);
  phaseRef.current = phase;
  itemsRef.current = items;
  const hasFiles = items.length > 0;

  useSeo({ title: seoPage.title, description: seoPage.description, path: seoPage.path, jsonLd: pageJsonLd(seoPage) });

  const openPicker = () => inputRef.current?.click();
  const addNewItems = (newItems) => {
    if (!newItems.length) return;
    setItems((current) => [...current, ...newItems]);
    if (phaseRef.current === "live") beam.addItems(newItems);
  };
  const removeItem = (id) => setItems((current) => {
    const item = current.find((candidate) => candidate.id === id);
    if (item?.url) URL.revokeObjectURL(item.url);
    if (item && phaseRef.current === "live") beam.removeItem(item);
    return current.filter((candidate) => candidate.id !== id);
  });

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return undefined;
    const measure = () => setCardHeight(element.offsetHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    itemsRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
  }, []);

  useEffect(() => {
    const hasFilesInDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const reset = () => { dragDepth.current = 0; setIsDragging(false); };
    const enter = (event) => { if (!hasFilesInDrag(event)) return; event.preventDefault(); dragDepth.current += 1; setIsDragging(true); };
    const over = (event) => { if (hasFilesInDrag(event)) event.preventDefault(); };
    const leave = (event) => { if (!hasFilesInDrag(event)) return; dragDepth.current -= 1; if (dragDepth.current <= 0) reset(); };
    const drop = async (event) => {
      if (!hasFilesInDrag(event)) return;
      event.preventDefault(); reset();
      if (!["upload", "live"].includes(phaseRef.current)) return;
      try { addNewItems(toItems(await gatherDropItems(event.dataTransfer))); } catch { /* ignore unreadable entries */ }
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop); window.addEventListener("dragend", reset);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); window.removeEventListener("dragend", reset); };
  }, []);

  const onInputChange = (event) => {
    if (event.target.files?.length) addNewItems(toItems(Array.from(event.target.files).map((file) => ({ type: "file", file }))));
    event.target.value = "";
  };

  const beginDrop = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("transfer");
    setTransfer({ state: "staging", localProgress: 0, transferProgress: 0, error: "", jobId: "", shareUrl: "" });
    try {
      const started = await startHostedTransfer({
        items,
        expiresInDays: expiry,
        message: note,
        signal: controller.signal,
        onProgress: (localProgress) => setTransfer((value) => ({ ...value, localProgress })),
        onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id })),
      });
      setTransfer((value) => ({ ...value, ...started, jobId: started.id }));
      const complete = await waitForHostedTransfer(started.id, {
        signal: controller.signal,
        onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id })),
      });
      const share = await createDropShare({ transfer: complete, items, note, expiresInDays: expiry });
      setTransfer((value) => ({ ...value, ...complete, shareUrl: share.shareUrl }));
      setPhase("transfer-success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setTransfer((value) => ({ ...value, state: "error", error: error?.message || "Transfer stopped." }));
    }
  };

  const beginPool = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("transfer");
    setTransfer({ state: "opening", localProgress: 0, transferProgress: 0, error: "", jobId: "", shareUrl: "" });
    try {
      const created = await createPool({ name: poolName, expiresInDays: expiry });
      const shareUrl = poolShareUrl(created.id);
      if (!hasFiles) {
        setTransfer((value) => ({ ...value, state: "complete", shareUrl, poolId: created.id }));
        setPhase("transfer-success");
        return;
      }
      setTransfer((value) => ({ ...value, state: "staging", poolId: created.id, shareUrl }));
      const started = await startHostedTransfer({
        items,
        expiresInDays: expiry,
        title: poolName || "Filzy pool upload",
        signal: controller.signal,
        onProgress: (localProgress) => setTransfer((value) => ({ ...value, localProgress })),
        onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id, poolId: created.id, shareUrl })),
      });
      const complete = await waitForHostedTransfer(started.id, {
        signal: controller.signal,
        onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id, poolId: created.id, shareUrl })),
      });
      await addPoolTransfer(created.id, complete, items);
      setTransfer((value) => ({ ...value, ...complete, shareUrl, poolId: created.id }));
      setPhase("transfer-success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setTransfer((value) => ({ ...value, state: "error", error: error?.message || "Pool creation stopped." }));
    }
  };

  const cancelDrop = async () => {
    abortRef.current?.abort();
    if (transfer.jobId) await cancelTransferJob(transfer.jobId).catch(() => {});
    setTransfer({ state: "", localProgress: 0, transferProgress: 0, error: "", jobId: "", shareUrl: "" });
    setPhase("upload");
  };

  const reset = () => {
    items.forEach((item) => item.url && URL.revokeObjectURL(item.url));
    setItems([]); setNote(""); setPoolName(""); setPhase("upload");
    setTransfer({ state: "", localProgress: 0, transferProgress: 0, error: "", jobId: "", shareUrl: "" });
  };

  const startCurrent = () => {
    if (activeId === "beam") { beam.start(items, note); setPhase("live"); return; }
    if (activeId === "drop") { void beginDrop(); return; }
    void beginPool();
  };

  const uploadCard = (
    <motion.div key="upload" {...phaseSwap} className="w-full max-w-[280px]">
      <motion.div animate={{ height: cardHeight ?? "auto" }} transition={{ duration: 0.3, ease: "easeOut" }} className="glass-surface w-full overflow-hidden rounded-2xl border border-white/30 bg-white/55">
        <div ref={innerRef} className="flex flex-col gap-[8px] p-[8px]">
          {!hasFiles ? (
            <motion.div key="empty" {...phaseSwap} className="flex flex-col gap-[8px]">
              <TabBar tabs={TABS} activeId={activeId} onChange={setActiveId} />
              {activeId === "beam" ? <DropBox isDragging={isDragging} onOpen={openPicker} /> : (
                <Dropzone
                  isDragging={isDragging}
                  onOpen={openPicker}
                  Icon={Plus}
                  title="Add files"
                  subtitle={activeId === "pool" ? "Add now, or open an empty pool" : "Share up to 25 GB with one link"}
                  dragTitle="Drop files to add"
                />
              )}
            </motion.div>
          ) : activeId === "beam" ? (
            <FileList items={items} onRemove={removeItem} onOpen={openPicker} note={note} setNote={setNote} isDragging={isDragging} />
          ) : (
            <TransferFileList items={items} onRemove={removeItem} onOpen={openPicker} mode={activeId} note={note} setNote={setNote} expiry={expiry} setExpiry={setExpiry} poolName={poolName} setPoolName={setPoolName} isDragging={isDragging} />
          )}
          {activeId === "pool" && !hasFiles && (
            <div className="flex gap-[4px]"><ExpirySelect value={expiry} onChange={setExpiry} /><input value={poolName} onChange={(event) => setPoolName(event.target.value)} placeholder="Pool name…" className="h-[36px] min-w-0 flex-1 rounded-[10px] border border-border bg-white px-[10px] text-[13px] text-text outline-none placeholder:text-dalt-text focus:border-text/50" /></div>
          )}
          <CtaButton label={activeId === "beam" ? "Start streaming" : activeId === "pool" ? "Start a pool" : "Get a link"} disabled={activeId !== "pool" && !hasFiles} onClick={startCurrent} />
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <>
      <div className="flex min-h-[100svh] shrink-0 items-center justify-center px-[10px] pb-[44px] pt-[60px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
        <AnimatePresence mode="wait">
          {phase === "upload" ? uploadCard : phase === "transfer" ? (
            <motion.div key="transfer" {...phaseSwap} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><TransferProgress state={transfer.state} localProgress={transfer.localProgress} transferProgress={transfer.transferProgress} error={transfer.error} onCancel={cancelDrop} onRetry={activeId === "pool" ? beginPool : beginDrop} /></motion.div>
          ) : phase === "transfer-success" ? (
            <motion.div key="success" {...phaseSwap} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><TransferSuccess shareUrl={transfer.shareUrl} pool={Boolean(transfer.poolId)} onReset={reset} /></motion.div>
          ) : phase === "stopped" ? (
            <motion.div key="stopped" {...phaseSwap}><StreamStopped onUploadMore={reset} /></motion.div>
          ) : (
            <motion.div key="live" {...phaseSwap}><Streaming items={items} users={beam.users} speed={beam.aggregateSpeed} shareUrl={beam.shareUrl} onStop={() => { beam.stop(); setPhase("stopped"); }} onKick={beam.kick} onOverdrive={beam.setOverdrive} onAddMore={openPicker} onRemove={removeItem} isDragging={isDragging} /></motion.div>
          )}
        </AnimatePresence>
      </div>
      <input ref={inputRef} type="file" multiple hidden onChange={onInputChange} />
    </>
  );
}
