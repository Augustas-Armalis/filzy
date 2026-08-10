import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, Download, KeyRound, Link as LinkIcon, LoaderCircle, PartyPopper, Plus, QrCode, UploadCloud, WavesLadder, X } from "lucide-react";
import { Row } from "@/components/BeamUpload";
import { QRCode } from "@/components/QRCode";
import { CtaButton, ProgressBar, StackIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/files";
import { dropFileUrl } from "@/lib/drops";

const EXPIRIES = [1, 7];

export function ExpirySelect({ value, onChange, className }) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <select
        aria-label="Link expiry"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-[36px] w-full cursor-pointer appearance-none rounded-[10px] border border-border bg-white pl-[31px] pr-[28px] text-[13px] text-text outline-none transition-colors hover:bg-white-hover focus:border-text/50"
      >
        {EXPIRIES.map((days) => <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>)}
      </select>
      <CalendarDays size={14} strokeWidth={1.17} absoluteStrokeWidth className="pointer-events-none absolute left-[10px] top-[11px] text-alt-text" />
      <ChevronDown size={14} strokeWidth={1.17} absoluteStrokeWidth className="pointer-events-none absolute right-[9px] top-[11px] text-alt-text" />
    </div>
  );
}

export function TransferFileList({ items, onRemove, onOpen, mode, note, setNote, expiry, setExpiry, poolName, setPoolName, isDragging }) {
  const totalBytes = items.reduce((sum, item) => sum + (item.kind === "folder" ? item.size : item.file.size), 0);
  const scrollRef = useRef(null);
  const [mask, setMask] = useState("none");

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => {
      const top = Math.min(element.scrollTop, 20);
      const bottom = Math.min(Math.max(element.scrollHeight - element.clientHeight - element.scrollTop, 0), 20);
      setMask(element.scrollHeight > element.clientHeight + 1
        ? `linear-gradient(to bottom,transparent 0,#000 ${top}px,#000 calc(100% - ${bottom}px),transparent 100%)`
        : "none");
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [items.length]);

  return (
    <div className="flex flex-col gap-[8px]">
      <div className={cn("flex h-[46px] items-center justify-between rounded-[12px] border border-dashed border-border bg-bg px-[10px]", isDragging && "border-text bg-bg-hover")}>
        <div className="flex min-w-0 items-center gap-[5px] text-[13px] text-alt-text">
          <span>{items.length} item{items.length === 1 ? "" : "s"}</span><span className="h-[2.5px] w-[2.5px] rounded-full bg-border" /><span>{formatBytes(totalBytes)}</span>
        </div>
        <button type="button" onClick={onOpen} className="flex h-[30px] cursor-pointer items-center gap-[5px] rounded-[9px] border border-border bg-white px-[9px] text-[13px] text-text transition-colors hover:bg-white-hover">
          <Plus size={15} strokeWidth={1.17} absoluteStrokeWidth /> Add more
        </button>
      </div>
      <div ref={scrollRef} style={{ maskImage: mask, WebkitMaskImage: mask }} className="flex max-h-[300px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <motion.div key={item.id} layout initial={{ opacity: 0, filter: "blur(7px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(7px)" }}>
              <Row item={item} onRemove={onRemove} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex gap-[4px]">
        <ExpirySelect value={expiry} onChange={setExpiry} />
        <input
          value={mode === "pool" ? poolName : note}
          onChange={(event) => mode === "pool" ? setPoolName(event.target.value) : setNote(event.target.value)}
          placeholder={mode === "pool" ? "Pool name…" : "Leave note…"}
          maxLength={mode === "pool" ? 80 : 100}
          className="h-[36px] min-w-0 flex-1 rounded-[10px] border border-border bg-white px-[10px] text-[13px] text-text outline-none placeholder:text-dalt-text focus:border-text/50"
        />
      </div>
    </div>
  );
}

export function TransferAdvancedSettings({ password, setPassword, maxDownloads, setMaxDownloads }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, filter: "blur(8px)" }}
      animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
      exit={{ opacity: 0, height: 0, filter: "blur(8px)" }}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-[4px] rounded-[12px] border border-border bg-bg p-[6px]">
        <div className="relative">
          <KeyRound size={14} strokeWidth={1.17} absoluteStrokeWidth className="pointer-events-none absolute left-[10px] top-[11px] text-alt-text" />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (optional)"
            minLength={4}
            maxLength={100}
            className="h-[36px] w-full rounded-[10px] border border-border bg-white pl-[31px] pr-[10px] text-[13px] text-text outline-none placeholder:text-dalt-text focus:border-text/50"
          />
        </div>
        <div className="relative">
          <select
            aria-label="Automatic deletion after downloads"
            value={maxDownloads}
            onChange={(event) => setMaxDownloads(Number(event.target.value))}
            className="h-[36px] w-full cursor-pointer appearance-none rounded-[10px] border border-border bg-white px-[10px] pr-[28px] text-[13px] text-text outline-none transition-colors hover:bg-white-hover focus:border-text/50"
          >
            <option value={0}>Keep until expiry</option>
            <option value={1}>Delete after 1 download</option>
            <option value={5}>Delete after 5 downloads</option>
            <option value={10}>Delete after 10 downloads</option>
            <option value={50}>Delete after 50 downloads</option>
          </select>
          <ChevronDown size={14} strokeWidth={1.17} absoluteStrokeWidth className="pointer-events-none absolute right-[9px] top-[11px] text-alt-text" />
        </div>
      </div>
    </motion.div>
  );
}

export function TransferProgress({ state, localProgress, transferProgress, error, onCancel, onRetry }) {
  const staging = ["receiving", "staging", "opening", "loading-files"].includes(state);
  const value = Math.max(localProgress || 0, transferProgress || 0);
  const label = staging ? "Preparing your files…" : "Uploading your files…";
  const detail = staging ? "Keeping everything ready for a clean upload." : `${Math.round((value || 0) * 100)}% complete`;
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex min-h-[126px] flex-col items-center justify-center gap-[9px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={UploadCloud} />
        <div>
          <p className="text-[14px] text-text">{error || label}</p>
          {!error && <p className="text-[11px] text-alt-text">{detail}</p>}
        </div>
        {!error && <ProgressBar value={value || 0} className="max-w-[240px]" />}
      </div>
      {error ? (
        <div className="flex gap-[4px]"><CtaButton label="Try again" onClick={onRetry} /><IconButton label="Back" Icon={X} onClick={onCancel} /></div>
      ) : (
        <CtaButton label="Cancel upload" onClick={onCancel} />
      )}
    </div>
  );
}

function IconButton({ label, Icon, onClick }) {
  return <button type="button" aria-label={label} onClick={onClick} className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-border bg-white transition-colors hover:bg-white-hover"><Icon size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" /></button>;
}

export function TransferLoading({ label = "Opening…" }) {
  return (
    <div className="glass-surface w-full max-w-[280px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
      <div className="flex min-h-[126px] flex-col items-center justify-center gap-[9px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={LoaderCircle} spin />
        <p className="text-[14px] text-text">{label}</p>
      </div>
    </div>
  );
}

export function TransferSuccess({ shareUrl, pool = false, onReset }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex min-h-[110px] flex-col items-center justify-center gap-[9px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={pool ? WavesLadder : PartyPopper} />
        <div><p className="text-[14px] text-text">{pool ? "Your pool is open!" : "Upload successful!"}</p><p className="text-[11px] text-alt-text">{pool ? "Share the link and let everyone add files." : "Copy the Filzy link and share it."}</p></div>
      </div>
      <div className="flex gap-[4px]">
        <CtaButton label={copied ? "Copied!" : "Copy link"} onClick={copy} />
        <IconButton label="Show QR code" Icon={QrCode} onClick={() => setShowQr((value) => !value)} />
        {onReset && <IconButton label="Close" Icon={X} onClick={onReset} />}
      </div>
      <AnimatePresence initial={false}>
        {showQr && <motion.div initial={{ opacity: 0, height: 0, filter: "blur(8px)" }} animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }} exit={{ opacity: 0, height: 0, filter: "blur(8px)" }} className="overflow-hidden rounded-[12px] border border-border bg-white p-[16px]"><QRCode value={shareUrl} /></motion.div>}
      </AnimatePresence>
    </div>
  );
}

export function DropReceiveCard({ share, accessToken = "" }) {
  const days = Math.max(0, Math.ceil((share.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  const urls = share.files.map((_, index) => dropFileUrl(share.id, index, accessToken));
  const downloadAll = () => urls.forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
  return (
    <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
      <div className="flex min-h-[92px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={LinkIcon} />
        <div><p className="text-[14px] text-text">Files shared with Filzy</p>{share.note && <p className="text-[11px] text-alt-text">{share.note}</p>}</div>
      </div>
      <div className="flex max-h-[300px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {share.files.map((file, index) => (
          <a key={`${file.name}-${index}`} href={urls[index]} download className="flex h-[54px] cursor-pointer items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[9px] transition-colors hover:bg-white-hover">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-border/60 bg-bg"><LinkIcon size={19} strokeWidth={1.3} absoluteStrokeWidth className="text-alt-text" /></span>
            <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[13px] text-text">{file.name}</span><span className="block text-[11px] text-alt-text">{formatBytes(file.size)}</span></span>
            <Download size={15} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text" />
          </a>
        ))}
      </div>
      <p className="text-center text-[10px] text-alt-text">Expires in {days} day{days === 1 ? "" : "s"}</p>
      <button type="button" onClick={downloadAll} className="flex h-[38px] cursor-pointer items-center justify-center rounded-[11px] bg-text font-casser text-[16px] font-normal text-white transition-colors hover:bg-text-hover">Download all</button>
    </div>
  );
}
