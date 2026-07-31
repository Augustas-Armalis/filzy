import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, File, Link as LinkIcon, Plus, QrCode, WavesLadder, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { TransferProgress, TransferSuccess } from "@/components/SwissTransferUI";
import { QRCode } from "@/components/QRCode";
import { CtaButton, StackIcon } from "@/components/ui";
import { formatBytes, kindOf } from "@/lib/files";
import { addPoolTransfer, closePool, getPool, ownerSecretForPool, poolShareUrl } from "@/lib/pools";
import { cancelSwissJob, openCompanion, openSwissJob, startSwissTransfer, swissTransferUrl, waitForSwissTransfer } from "@/lib/swissCompanion";
import { useSeo } from "@/lib/seo";

function daysLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function PoolFile({ file, transferId }) {
  return (
    <a href={swissTransferUrl(transferId)} target="_blank" rel="noreferrer" className="flex h-[54px] items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[9px] transition-colors hover:bg-white-hover">
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-border/60 bg-bg"><File size={21} strokeWidth={1.4} absoluteStrokeWidth className="text-alt-text" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-text">{file.name}</span><span className="block text-[11px] text-alt-text">{formatBytes(file.size)}</span></span>
      <Download size={15} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text" />
    </a>
  );
}

export default function PoolPage() {
  const { poolId = "" } = useParams();
  const [pool, setPool] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [swiss, setSwiss] = useState({});
  const [showQr, setShowQr] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const ownerSecret = ownerSecretForPool(poolId);
  const shareUrl = poolShareUrl(poolId);

  useSeo({ title: pool?.name ? `${pool.name} | Filzy Pool` : "Shared Filzy Pool", description: "Add and download files in a shared Filzy pool.", path: `/p/${poolId}`, robots: "noindex, nofollow" });

  const refresh = async () => {
    try { const next = await getPool(poolId); setPool(next); setError(""); setPhase((value) => value === "loading" ? "ready" : value); }
    catch (cause) { setError(cause?.message || "This pool is unavailable."); setPhase("error"); }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { window.clearInterval(timer); abortRef.current?.abort(); };
  }, [poolId]);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const items = files.map((file, index) => ({ id: index, file, kind: kindOf(file) }));
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("uploading"); setSwiss({ state: "staging", localProgress: 0, transferProgress: 0 });
    try {
      const expiry = Math.max(1, daysLeft(pool.expiresAt));
      const supportedExpiry = [1, 7, 15, 30].find((days) => days >= expiry) || 30;
      const started = await startSwissTransfer({
        items,
        expiresInDays: supportedExpiry,
        title: pool.name,
        signal: controller.signal,
        onProgress: (localProgress) => setSwiss((value) => ({ ...value, localProgress })),
        onState: (job) => setSwiss((value) => ({ ...value, ...job, jobId: job.id })),
      });
      const complete = await waitForSwissTransfer(started.id, { signal: controller.signal, onState: (job) => setSwiss((value) => ({ ...value, ...job, jobId: job.id })) });
      await addPoolTransfer(poolId, complete.transferUrl, items);
      await refresh();
      setPhase("ready");
    } catch (cause) {
      if (cause?.name === "AbortError") return;
      setSwiss((value) => ({ ...value, state: "error", error: cause?.message || "Upload stopped." }));
    }
  };

  const cancel = async () => {
    abortRef.current?.abort();
    if (swiss.jobId) await cancelSwissJob(swiss.jobId).catch(() => {});
    setPhase("ready"); setSwiss({});
  };

  const close = async () => {
    if (!ownerSecret) return;
    try { setPool(await closePool(poolId, ownerSecret)); } catch (cause) { setError(cause?.message || "Pool could not be closed."); }
  };

  const batches = pool?.batches || [];
  const files = batches.flatMap((batch) => batch.files.map((file) => ({ ...file, transferId: batch.transferId, batchId: batch.id })));
  const downloadAll = () => [...new Set(batches.map((batch) => batch.transferId))].forEach((id) => window.open(swissTransferUrl(id), "_blank", "noopener,noreferrer"));

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-[10px] pb-[44px] pt-[60px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
      <AnimatePresence mode="wait">
        {phase === "uploading" ? (
          <motion.div key="uploading" initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(10px)" }} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><TransferProgress state={swiss.state} localProgress={swiss.localProgress} transferProgress={swiss.transferProgress} error={swiss.error} onCancel={cancel} onOpenCompanion={openCompanion} onOpenSwiss={() => swiss.jobId && openSwissJob(swiss.jobId)} /></motion.div>
        ) : pool ? (
          <motion.div key="pool" initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
            <div className="flex min-h-[104px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[14px] text-center"><StackIcon Icon={WavesLadder} /><div><p className="text-[14px] text-text">{pool.name}</p><p className="text-[11px] text-alt-text">{pool.closed ? "This pool is closed." : `${daysLeft(pool.expiresAt)} day${daysLeft(pool.expiresAt) === 1 ? "" : "s"} left · ${files.length} file${files.length === 1 ? "" : "s"}`}</p></div></div>
            {!pool.closed && <button type="button" onClick={() => inputRef.current?.click()} className="flex h-[72px] w-full flex-col items-center justify-center gap-[5px] rounded-[12px] border border-dashed border-border bg-bg text-alt-text transition-colors hover:bg-bg-hover"><Plus size={18} strokeWidth={1.17} absoluteStrokeWidth /><span className="text-[13px]">Add files</span></button>}
            {files.length > 0 && <div className="flex max-h-[300px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{files.map((file, index) => <PoolFile key={`${file.batchId}-${index}`} file={file} transferId={file.transferId} />)}</div>}
            {error && <p className="px-[4px] text-center text-[11px] text-red-600">{error}</p>}
            <div className="flex gap-[4px]">
              <CtaButton label={files.length ? "Download all" : "Copy link"} onClick={files.length ? downloadAll : () => navigator.clipboard.writeText(shareUrl)} />
              {files.length > 0 && <button type="button" aria-label="Copy pool link" onClick={() => navigator.clipboard.writeText(shareUrl)} className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-white text-text hover:bg-white-hover"><LinkIcon size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>}
              <button type="button" aria-label="Show pool QR code" onClick={() => setShowQr((value) => !value)} className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-white text-text hover:bg-white-hover"><QrCode size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>
              {ownerSecret && !pool.closed && <button type="button" aria-label="Close pool" onClick={close} className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-white text-text hover:bg-white-hover"><X size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>}
            </div>
            <AnimatePresence initial={false}>{showQr && <motion.div initial={{ opacity: 0, height: 0, filter: "blur(8px)" }} animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }} exit={{ opacity: 0, height: 0, filter: "blur(8px)" }} className="overflow-hidden rounded-[12px] border border-border bg-white p-[16px]"><QRCode value={shareUrl} /></motion.div>}</AnimatePresence>
          </motion.div>
        ) : phase === "error" ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><div className="flex min-h-[142px] items-center justify-center rounded-[12px] border border-border bg-bg px-[18px] text-center text-[13px] text-alt-text">{error}</div><CtaButton label="Try again" onClick={refresh} /></motion.div>
        ) : (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><TransferSuccess shareUrl={shareUrl} pool /></motion.div>
        )}
      </AnimatePresence>
      <input ref={inputRef} type="file" multiple hidden onChange={upload} />
    </div>
  );
}
