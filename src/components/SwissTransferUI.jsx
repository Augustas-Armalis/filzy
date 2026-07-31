import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ExternalLink, Link as LinkIcon, PartyPopper, Plus, QrCode, UploadCloud, WavesLadder, X } from "lucide-react";
import { Row } from "@/components/BeamUpload";
import { QRCode } from "@/components/QRCode";
import { CtaButton, ProgressBar, StackIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/files";

const EXPIRIES = [1, 7, 15, 30];

function SelectField({ value, onChange, children, ariaLabel }) {
  return (
    <div className="relative min-w-0 flex-1">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[36px] w-full appearance-none rounded-[10px] border border-border bg-white pl-[31px] pr-[28px] text-[13px] text-text outline-none transition-colors hover:bg-white-hover focus:border-text/50"
      >
        {children}
      </select>
      <CalendarDays size={14} strokeWidth={1.17} absoluteStrokeWidth className="pointer-events-none absolute left-[10px] top-[11px] text-alt-text" />
      <span className="pointer-events-none absolute right-[10px] top-[10px] text-[12px] text-alt-text">⌄</span>
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
        <button type="button" onClick={onOpen} className="flex h-[30px] items-center gap-[5px] rounded-[9px] border border-border bg-white px-[9px] text-[13px] text-text transition-colors hover:bg-white-hover">
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
        <SelectField value={expiry} onChange={(value) => setExpiry(Number(value))} ariaLabel="Link expiry">
          {EXPIRIES.map((days) => <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>)}
        </SelectField>
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

export function TransferProgress({ state, localProgress, transferProgress, error, onCancel, onOpenCompanion, onOpenSwiss }) {
  const verifying = state === "verification";
  const staging = ["receiving", "staging"].includes(state);
  const value = staging ? localProgress : transferProgress;
  const label = staging ? "Preparing your files…" : verifying ? "Verify once in SwissTransfer" : "Your files are being uploaded…";
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex min-h-[142px] flex-col items-center justify-center gap-[11px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={UploadCloud} />
        <div>
          <p className="text-[14px] text-text">{error || label}</p>
          <p className="text-[11px] text-alt-text">{verifying ? "Complete the code check in the opened window." : "SwissTransfer stores the transfer; Filzy keeps the interface simple."}</p>
        </div>
        {!verifying && !error && <ProgressBar value={value || 0} className="max-w-[240px]" />}
      </div>
      {error ? (
        <div className="flex gap-[4px]"><CtaButton label="Open companion" onClick={onOpenCompanion} /><IconButton label="Back" Icon={X} onClick={onCancel} /></div>
      ) : verifying ? (
        <div className="flex gap-[4px]"><CtaButton label="Open SwissTransfer" onClick={onOpenSwiss} /><IconButton label="Cancel" Icon={X} onClick={onCancel} /></div>
      ) : (
        <CtaButton label="Cancel upload" onClick={onCancel} />
      )}
    </div>
  );
}

function IconButton({ label, Icon, onClick }) {
  return <button type="button" aria-label={label} onClick={onClick} className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-white transition-colors hover:bg-white-hover"><Icon size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" /></button>;
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

export function SwissReceiveCard({ transferId }) {
  const url = `https://www.swisstransfer.com/d/${transferId}`;
  return (
    <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
      <div className="flex min-h-[142px] flex-col items-center justify-center gap-[10px] rounded-[12px] border border-border bg-bg px-[20px] text-center">
        <StackIcon Icon={LinkIcon} />
        <div><p className="text-[14px] text-text">Files shared with Filzy</p><p className="text-[11px] text-alt-text">SwissTransfer securely hosts this transfer.</p></div>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="flex h-[38px] items-center justify-center gap-[6px] rounded-[11px] bg-text font-casser text-[16px] font-normal text-white transition-colors hover:bg-text-hover">Open download <ExternalLink size={14} strokeWidth={1.17} absoluteStrokeWidth /></a>
    </div>
  );
}

export function DropReceiveCard({ share }) {
  const url = `https://www.swisstransfer.com/d/${share.transferId}`;
  const days = Math.max(0, Math.ceil((share.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  return (
    <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
      <div className="flex min-h-[92px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[18px] text-center">
        <StackIcon Icon={LinkIcon} />
        <div><p className="text-[14px] text-text">Files shared with Filzy</p>{share.note && <p className="text-[11px] text-alt-text">{share.note}</p>}</div>
      </div>
      <div className="flex max-h-[300px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {share.files.map((file, index) => (
          <a key={`${file.name}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex h-[54px] items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[9px] transition-colors hover:bg-white-hover">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-border/60 bg-bg"><LinkIcon size={19} strokeWidth={1.3} absoluteStrokeWidth className="text-alt-text" /></span>
            <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[13px] text-text">{file.name}</span><span className="block text-[11px] text-alt-text">{formatBytes(file.size)}</span></span>
            <ExternalLink size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text" />
          </a>
        ))}
      </div>
      <p className="text-center text-[10px] text-alt-text">Expires in {days} day{days === 1 ? "" : "s"}</p>
      <a href={url} target="_blank" rel="noreferrer" className="flex h-[38px] items-center justify-center rounded-[11px] bg-text font-casser text-[16px] font-normal text-white transition-colors hover:bg-text-hover">Download all</a>
    </div>
  );
}
