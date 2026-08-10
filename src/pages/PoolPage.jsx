import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, File, Link as LinkIcon, LockKeyhole, Plus, QrCode, WavesLadder, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { TransferLoading, TransferProgress } from "@/components/TransferUI";
import { QRCode } from "@/components/QRCode";
import { CtaButton, StackIcon } from "@/components/ui";
import { formatBytes, kindOf } from "@/lib/files";
import { addPoolTransfer, closePool, getPool, ownerSecretForPool, poolFileUrl, poolShareUrl, unlockPool } from "@/lib/pools";
import { cancelTransferJob, startHostedTransfer, waitForHostedTransfer } from "@/lib/transferCompanion";
import { useSeo } from "@/lib/seo";

function daysLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function triggerDownloads(urls) {
  urls.forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

function PoolFile({ file, href }) {
  return (
    <a href={href} download className="flex h-[54px] cursor-pointer items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[9px] transition-colors hover:bg-white-hover">
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
  const [transfer, setTransfer] = useState({});
  const [showQr, setShowQr] = useState(false);
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem(`filzy-pool-access:${poolId}`) || "");
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const ownerSecret = ownerSecretForPool(poolId);
  const shareUrl = poolShareUrl(poolId);

  useSeo({ title: pool?.name ? `${pool.name} | Filzy Pool` : "Shared Filzy Pool", description: "Add and download files in a shared Filzy pool.", path: `/p/${poolId}`, robots: "noindex, nofollow" });

  const refresh = async () => {
    try { const next = await getPool(poolId, accessToken); setPool(next); setError(""); setPhase((value) => value === "loading" ? "ready" : value); }
    catch (cause) { setError(cause?.message || "This pool is unavailable."); setPhase("error"); }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { window.clearInterval(timer); abortRef.current?.abort(); };
  }, [poolId, accessToken]);

  const unlock = async () => {
    try {
      const next = await unlockPool(poolId, password);
      sessionStorage.setItem(`filzy-pool-access:${poolId}`, next.accessToken);
      setAccessToken(next.accessToken);
      setPool(next);
      setPassword("");
      setError("");
    } catch (cause) { setError(cause?.message || "Incorrect password."); }
  };

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const items = files.map((file, index) => ({ id: index, file, kind: kindOf(file) }));
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("uploading"); setTransfer({ state: "staging", localProgress: 0, transferProgress: 0 });
    try {
      const expiry = Math.max(1, daysLeft(pool.expiresAt));
      const supportedExpiry = [1, 7].find((days) => days >= expiry) || 7;
      const started = await startHostedTransfer({
        items,
        expiresInDays: supportedExpiry,
        maxDownloads: pool.maxDownloads || 0,
        title: pool.name,
        signal: controller.signal,
        onProgress: (localProgress) => setTransfer((value) => ({ ...value, localProgress })),
        onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id })),
      });
      const complete = await waitForHostedTransfer(started.id, { signal: controller.signal, onState: (job) => setTransfer((value) => ({ ...value, ...job, jobId: job.id })) });
      await addPoolTransfer(poolId, complete, items);
      await refresh();
      setPhase("ready");
    } catch (cause) {
      if (cause?.name === "AbortError") return;
      setTransfer((value) => ({ ...value, state: "error", error: cause?.message || "Upload stopped." }));
    }
  };

  const cancel = async () => {
    abortRef.current?.abort();
    if (transfer.jobId) await cancelTransferJob(transfer.jobId).catch(() => {});
    setPhase("ready"); setTransfer({});
  };

  const close = async () => {
    if (!ownerSecret) return;
    try { setPool(await closePool(poolId, ownerSecret)); } catch (cause) { setError(cause?.message || "Pool could not be closed."); }
  };

  const batches = pool?.batches || [];
  const files = batches.flatMap((batch) => batch.files.map((file, fileIndex) => ({ ...file, batchId: batch.id, fileIndex })));
  const downloadAll = () => triggerDownloads(files.map((file) => poolFileUrl(poolId, file.batchId, file.fileIndex, accessToken)));

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-[10px] pb-[44px] pt-[60px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
      <AnimatePresence mode="wait">
        {phase === "uploading" ? (
          <motion.div key="uploading" initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(10px)" }} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><TransferProgress state={transfer.state} localProgress={transfer.localProgress} transferProgress={transfer.transferProgress} error={transfer.error} onCancel={cancel} onRetry={() => inputRef.current?.click()} /></motion.div>
        ) : pool?.locked ? (
          <motion.div key="locked" initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
            <div className="flex min-h-[112px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[18px] text-center"><StackIcon Icon={LockKeyhole} /><div><p className="text-[14px] text-text">Password required</p><p className="text-[11px] text-alt-text">Enter it to open this pool.</p></div></div>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && password.length >= 4 && void unlock()} placeholder="Password" autoFocus className="h-[38px] rounded-[11px] border border-border bg-white px-[11px] text-[13px] text-text outline-none placeholder:text-dalt-text focus:border-text/50" />
            {error && <p className="px-[4px] text-center text-[11px] text-red-600">{error}</p>}
            <CtaButton label="Open pool" disabled={password.length < 4} onClick={unlock} />
          </motion.div>
        ) : pool ? (
          <motion.div key="pool" initial={{ opacity: 0, filter: "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
            <div className="flex min-h-[104px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[14px] text-center"><StackIcon Icon={WavesLadder} /><div><p className="text-[14px] text-text">{pool.name}</p><p className="text-[11px] text-alt-text">{pool.closed ? "This pool is closed." : `${daysLeft(pool.expiresAt)} day${daysLeft(pool.expiresAt) === 1 ? "" : "s"} left · ${files.length} file${files.length === 1 ? "" : "s"}`}</p></div></div>
            {!pool.closed && <button type="button" onClick={() => inputRef.current?.click()} className="flex h-[72px] w-full cursor-pointer flex-col items-center justify-center gap-[5px] rounded-[12px] border border-dashed border-border bg-bg text-alt-text transition-colors hover:bg-bg-hover"><Plus size={18} strokeWidth={1.17} absoluteStrokeWidth /><span className="text-[13px]">Add files</span></button>}
            {files.length > 0 && <div className="flex max-h-[300px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{files.map((file) => <PoolFile key={`${file.batchId}-${file.fileIndex}`} file={file} href={poolFileUrl(poolId, file.batchId, file.fileIndex, accessToken)} />)}</div>}
            {error && <p className="px-[4px] text-center text-[11px] text-red-600">{error}</p>}
            <div className="flex gap-[4px]">
              <CtaButton label={files.length ? "Download all" : "Copy link"} onClick={files.length ? downloadAll : () => navigator.clipboard.writeText(shareUrl)} />
              {files.length > 0 && <button type="button" aria-label="Copy pool link" onClick={() => navigator.clipboard.writeText(shareUrl)} className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-border bg-white text-text transition-colors hover:bg-white-hover"><LinkIcon size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>}
              <button type="button" aria-label="Show pool QR code" onClick={() => setShowQr((value) => !value)} className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-border bg-white text-text transition-colors hover:bg-white-hover"><QrCode size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>
              {ownerSecret && !pool.closed && <button type="button" aria-label="Close pool" onClick={close} className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-border bg-white text-text transition-colors hover:bg-white-hover"><X size={16} strokeWidth={1.17} absoluteStrokeWidth /></button>}
            </div>
            <AnimatePresence initial={false}>{showQr && <motion.div initial={{ opacity: 0, height: 0, filter: "blur(8px)" }} animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }} exit={{ opacity: 0, height: 0, filter: "blur(8px)" }} className="overflow-hidden rounded-[12px] border border-border bg-white p-[16px]"><QRCode value={shareUrl} /></motion.div>}</AnimatePresence>
          </motion.div>
        ) : phase === "error" ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><div className="flex min-h-[142px] items-center justify-center rounded-[12px] border border-border bg-bg px-[18px] text-center text-[13px] text-alt-text">{error}</div><CtaButton label="Try again" onClick={refresh} /></motion.div>
        ) : (
          <motion.div key="loading" initial={{ opacity: 0, filter: "blur(8px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}><TransferLoading label="Opening pool…" /></motion.div>
        )}
      </AnimatePresence>
      <input ref={inputRef} type="file" multiple hidden onChange={upload} />
    </div>
  );
}
