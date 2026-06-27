import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Users, WifiOff, Signal, User, QrCode, Share2, X, Settings2, Download, BadgeCheck, Loader, Zap, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/files";
import { Row, Thumb, splitName } from "@/components/BeamUpload";
import { QRCode } from "@/components/QRCode";

// Shown as the recipient subtitle when the sharer left no note.
const DEFAULT_NOTE = "Access & download now, before it’s turn off";

const STATUS = {
  downloading: { Icon: Download, label: "Downloading…", dot: "bg-blue-500", pulse: true },
  downloaded: { Icon: BadgeCheck, label: "Downloaded!", dot: "bg-yellow-400" },
  connected: { Icon: null, label: "Connected", dot: "bg-green-500" },
  offline: { Icon: null, label: "Offline", dot: "bg-red-500" },
};

// Static shell (StreamStopped / recipient). Animated cards use CARD_SHELL + CARD_INNER below.
const CARD = "flex w-[280px] max-w-full shrink-0 flex-col gap-[8px] rounded-2xl border border-white/20 bg-white/50 p-[8px] backdrop-blur-[16px]";
const CARD_SHELL = "w-[280px] max-w-full shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/50 backdrop-blur-[16px]";
const CARD_INNER = "flex flex-col gap-[8px] p-[8px]";
const CTA = "flex h-[38px] items-center justify-center rounded-[11px] bg-text font-casser text-[16px] font-normal text-white cursor-pointer transition-all duration-150 hover:bg-text-hover";

// Smoothly animate a card's height as its contents expand / collapse.
function useAutoHeight() {
  const ref = useRef(null);
  const [height, setHeight] = useState();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height];
}

// Blur-fade-up for content that expands into view (QR, file settings).
const reveal = {
  initial: { opacity: 0, y: 6, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.25, ease: "easeOut" },
};

// Masked, capped scroll area with eased top/bottom edge fades. Fades only when
// actually scrollable, and re-measures through add/remove + layout animations
// (otherwise the fade sticks on a stale, inflated scrollHeight).
function ScrollFade({ className, children }) {
  const ref = useRef(null);
  const [fade, setFade] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => {
      const scrollable = el.scrollHeight - el.clientHeight > 1;
      const top = scrollable ? Math.min(el.scrollTop, 24) : 0;
      const bottom = scrollable ? Math.min(Math.max(el.scrollHeight - el.clientHeight - el.scrollTop, 0), 24) : 0;
      setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    // Re-measure as rows animate in/out (childList) and shift (style transforms).
    const mo = new MutationObserver(recompute);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    return () => {
      el.removeEventListener("scroll", recompute);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  const mask = `linear-gradient(to bottom, transparent 0, #000 ${fade.top}px, #000 calc(100% - ${fade.bottom}px), transparent 100%)`;
  return (
    <div
      ref={ref}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className={cn("overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {children}
    </div>
  );
}

// Same stacked-box graphic as the upload box, with a swappable icon.
function StackBadge({ Icon, iconClass = "text-text" }) {
  return (
    <div className="relative h-[44px] w-[48px]">
      <div className="absolute inset-0 m-auto h-[32px] w-[32px] -translate-x-[2px] translate-y-[4px] -rotate-[15deg] rounded-[9px] border border-border bg-white" />
      <div className="absolute inset-0 m-auto flex h-[32px] w-[32px] translate-x-[6.5px] translate-y-[4px] rotate-[15deg] items-center justify-center rounded-[9px] border border-border bg-white">
        <Icon size={16} strokeWidth={1.17} absoluteStrokeWidth className={iconClass} />
      </div>
    </div>
  );
}

function SquareBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-border bg-white p-0 leading-none transition-all duration-150 hover:bg-white-hover"
    >
      {children}
    </button>
  );
}

// Presentational switch — the surrounding row button handles the click.
function Switch({ on }) {
  return (
    <div className={cn("relative h-[16px] w-[28px] shrink-0 rounded-full transition-all duration-150", on ? "bg-text" : "bg-border")}>
      <div className={cn("absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all duration-150", on ? "left-[14px]" : "left-[2px]")} />
    </div>
  );
}

function StatPill({ Icon, children, green }) {
  return (
    <div className="flex h-[32px] flex-1 items-center justify-center gap-[4px] rounded-[9px] border border-border bg-white">
      <Icon size={14} strokeWidth={1.17} absoluteStrokeWidth className={cn("transition-colors duration-150", green ? "text-green-500" : "text-alt-text")} />
      <p className={cn("text-[14px] transition-colors duration-150", green ? "text-green-500" : "text-alt-text")}>{children}</p>
    </div>
  );
}

// The "centered icon + title + subtitle" box (live / empty / stopped / recipient).
function StatusBox({ Icon, title, subtitle, iconClass }) {
  return (
    <div className="flex flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[8px] pt-[12px] pb-[16px]">
      <StackBadge Icon={Icon} iconClass={iconClass} />
      <div className="flex flex-col items-center gap-[1px] text-center">
        <p className="text-[15px] text-text">{title}</p>
        <p className="text-[12px] text-alt-text">{subtitle}</p>
      </div>
    </div>
  );
}

// Thin black bar shown inline while a file / recipient is downloading.
function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-text transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

function UserRow({ user, onRemove }) {
  const s = STATUS[user.status] || STATUS.connected;
  return (
    <div className="flex items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px]">
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-border/50 bg-bg">
        <User size={20} strokeWidth={1.5} absoluteStrokeWidth className="text-alt-text" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="truncate text-[14px] text-text">{user.name}</p>
        {user.status === "downloading" ? (
          <div className="flex min-w-0 items-center gap-[6px] text-[11px] text-alt-text">
            <div className="min-w-0 flex-1">
              <ProgressBar value={user.progress} />
            </div>
            <span className="shrink-0 tabular-nums">{Math.round((user.progress || 0) * 100)}%</span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-[5px] text-[11px] text-alt-text">
            {s.Icon && <s.Icon size={12} strokeWidth={1} absoluteStrokeWidth className="shrink-0" />}
            <span className="shrink-0">{s.label}</span>
            <div className={cn("h-[3.5px] w-[3.5px] shrink-0 rounded-full", s.dot, s.pulse && "animate-pulse")} />
            <span className="truncate">{user.location}</span>
          </div>
        )}
      </div>
      <button type="button" onClick={onRemove} className="group flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] transition-all duration-150 hover:bg-bg-hover">
        <X size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text transition-colors duration-150 group-hover:text-text" />
      </button>
    </div>
  );
}

// The streamed-files settings: add / remove files live + Overdrive. Edits are
// applied to the running beam (manifest is rebroadcast to every recipient).
function FileModule({ items, onRemove, onAddMore, isDragging, overdrive, onToggleOverdrive }) {
  const [overHeader, setOverHeader] = useState(false);
  const totalBytes = items.reduce((sum, it) => sum + (it.kind === "folder" ? it.size : it.file.size), 0);

  return (
    <>
      <div
        onDragEnter={() => setOverHeader(true)}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOverHeader(false);
        }}
        onDrop={() => setOverHeader(false)}
        className={cn(
          "flex h-fit w-full items-center justify-between rounded-[12px] border border-dashed border-border bg-bg p-[8px] pl-[12px] transition-all duration-150",
          isDragging && "border-text bg-bg-hover",
          overHeader && "border-solid",
        )}
      >
        {isDragging ? (
          <p className="text-[14px] text-text">Drop here!</p>
        ) : (
          <div className="flex items-center gap-[5px]">
            <p className="text-[14px] text-alt-text">{items.length} item{items.length === 1 ? "" : "s"}</p>
            <div className="h-[2.5px] w-[2.5px] rounded-full bg-border" />
            <p className="text-[14px] text-alt-text">{formatBytes(totalBytes)}</p>
          </div>
        )}
        <button type="button" onClick={onAddMore} className="flex h-[30px] cursor-pointer items-center justify-center gap-[5px] rounded-[9px] border border-border bg-white pl-[8px] pr-[10px] transition-all duration-150 hover:bg-white-hover">
          <Plus size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" />
          <p className="text-[14px] text-text">Add more</p>
        </button>
      </div>

      {items.length > 0 && (
        <ScrollFade className="flex max-h-[200px] flex-col gap-[4px]">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, filter: "blur(8px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(8px)" }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <Row item={item} onRemove={onRemove} />
              </motion.div>
            ))}
          </AnimatePresence>
        </ScrollFade>
      )}

      <button
        type="button"
        onClick={onToggleOverdrive}
        className="flex h-[36px] w-full cursor-pointer items-center justify-between rounded-[10px] border border-border bg-white px-[10px] transition-all duration-150 hover:bg-white-hover"
      >
        <div className="flex items-center gap-[6px]">
          <Zap size={14} strokeWidth={1.5} absoluteStrokeWidth className={cn("transition-colors duration-150", overdrive ? "fill-green-500 text-green-500" : "text-alt-text")} />
          <p className={cn("text-[14px] transition-colors duration-150", overdrive ? "text-green-500" : "text-text")}>Overdrive</p>
        </div>
        <Switch on={overdrive} />
      </button>
    </>
  );
}

// Left card: the live server + copy link / QR / share.
function ServerCard({ shareUrl }) {
  const [innerRef, height] = useAutoHeight();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Filzy", url: shareUrl });
      } catch {
        /* user dismissed */
      }
    } else {
      copyLink();
    }
  };

  return (
    <motion.div animate={{ height: height ?? "auto" }} transition={{ duration: 0.3, ease: "easeOut" }} className={CARD_SHELL}>
      <div ref={innerRef} className={CARD_INNER}>
        <StatusBox Icon={Radio} iconClass="text-green-500 animate-pulse [animation-duration:2.4s]" title="Your server is live!" subtitle="It's available as long as you run it here" />

        <div className="flex gap-[4px]">
          <button type="button" onClick={copyLink} className={cn(CTA, "flex-1")}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          {qrOpen ? (
            <>
              <SquareBtn onClick={share}>
                <Share2 size={18} strokeWidth={1.5} absoluteStrokeWidth className="text-text" />
              </SquareBtn>
              <SquareBtn onClick={() => setQrOpen(false)}>
                <X size={18} strokeWidth={1.5} absoluteStrokeWidth className="text-text" />
              </SquareBtn>
            </>
          ) : (
            <SquareBtn onClick={() => setQrOpen(true)}>
              <QrCode size={18} strokeWidth={1.5} absoluteStrokeWidth className="text-text" />
            </SquareBtn>
          )}
        </div>

        {qrOpen && (
          <motion.div {...reveal}>
            <div className="flex aspect-square w-full items-center justify-center rounded-[12px] border border-border bg-white p-[18px]">
              <QRCode value={shareUrl} />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// Right card: live stats + connected users (or empty) + stop + (toggled) file settings.
function StreamCard({ users, speed, items, onStop, onKick, onOverdrive, onAddMore, onRemove, isDragging }) {
  const [innerRef, height] = useAutoHeight();
  const [filesOpen, setFilesOpen] = useState(false);
  const [overdrive, setOverdrive] = useState(false);
  const hasUsers = users.length > 0;
  const downloading = users.filter((u) => u.status === "downloading");
  const avgProgress = downloading.length ? downloading.reduce((a, u) => a + (u.progress || 0), 0) / downloading.length : 0;

  const toggleOverdrive = () => {
    const next = !overdrive;
    setOverdrive(next);
    onOverdrive?.(next);
  };

  return (
    <motion.div animate={{ height: height ?? "auto" }} transition={{ duration: 0.3, ease: "easeOut" }} className={CARD_SHELL}>
      <div ref={innerRef} className={CARD_INNER}>
        <div className="flex gap-[4px]">
          <StatPill Icon={Signal} green={overdrive}>{formatBytes(speed || 0)}/s</StatPill>
          <StatPill Icon={User}>{users.length} Connected</StatPill>
        </div>

        {/* One summary bar averaging everyone currently downloading. */}
        {downloading.length > 0 && (
          <div className="flex items-center gap-[8px] rounded-[10px] border border-border bg-white px-[10px] py-[8px]">
            <Download size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-alt-text" />
            <div className="min-w-0 flex-1">
              <ProgressBar value={avgProgress} />
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-alt-text">{Math.round(avgProgress * 100)}%</span>
          </div>
        )}

        {hasUsers ? (
          <ScrollFade className="flex max-h-[210px] flex-col gap-[6px]">
            <AnimatePresence initial={false} mode="popLayout">
              {users.map((u) => (
                <motion.div
                  key={u.id}
                  layout
                  initial={{ opacity: 0, filter: "blur(8px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(8px)" }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <UserRow user={u} onRemove={() => onKick?.(u.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </ScrollFade>
        ) : (
          <StatusBox Icon={Users} title="Users will appear here" subtitle="Keep your device open while transfering" />
        )}

        <div className="flex gap-[4px]">
          <button type="button" onClick={onStop} className={cn(CTA, "flex-1")}>
            Stop streaming
          </button>
          <SquareBtn onClick={() => setFilesOpen((v) => !v)}>
            {filesOpen ? (
              <X size={18} strokeWidth={1.5} absoluteStrokeWidth className="text-text" />
            ) : (
              <Settings2 size={18} strokeWidth={1.5} absoluteStrokeWidth className="text-text" />
            )}
          </SquareBtn>
        </div>

        {/* Stream settings: the files you're beaming + Overdrive. */}
        {filesOpen && (
          <motion.div {...reveal} className="flex flex-col gap-[8px]">
            <FileModule
              items={items}
              onRemove={onRemove}
              onAddMore={onAddMore}
              isDragging={isDragging}
              overdrive={overdrive}
              onToggleOverdrive={toggleOverdrive}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export function Streaming({ items, users, speed, shareUrl, onStop, onKick, onOverdrive, onAddMore, onRemove, isDragging }) {
  return (
    <div className="flex flex-col items-center gap-[10px] lg:flex-row lg:items-center">
      <ServerCard shareUrl={shareUrl} />
      <StreamCard
        users={users}
        speed={speed}
        items={items}
        onStop={onStop}
        onKick={onKick}
        onOverdrive={onOverdrive}
        onAddMore={onAddMore}
        onRemove={onRemove}
        isDragging={isDragging}
      />
    </div>
  );
}

export function StreamStopped({ onUploadMore }) {
  return (
    <div className={CARD}>
      <StatusBox Icon={WifiOff} title="Stream stopped!" subtitle="Nobody can access the files anymore" />
      <button type="button" onClick={onUploadMore} className={cn(CTA, "w-full")}>
        Upload more
      </button>
    </div>
  );
}

/* ── Recipient side: what someone opening a shared link sees ──────────────── */

// A downloadable file row — clicking the icon or anywhere on the box downloads it.
function ReceiveRow({ item, status, progress, onDownload }) {
  const [head, tail] = splitName(item.name);

  return (
    <button
      type="button"
      onClick={onDownload}
      className="group flex w-full cursor-pointer items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px] text-left transition-all duration-150 hover:bg-white-hover"
    >
      <Thumb item={item} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 text-[14px] text-text">
          <span className="truncate">{head}</span>
          {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
        </div>
        {status === "downloading" ? (
          <div className="mt-[5px] flex h-[10px] items-center pr-[4px]">
            <ProgressBar value={progress} />
          </div>
        ) : (
          <p className="text-[11px] text-alt-text">{status === "done" ? "Downloaded" : formatBytes(item.size)}</p>
        )}
      </div>
      <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px]">
        <Download size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text transition-colors duration-150 group-hover:text-text" />
      </div>
    </button>
  );
}

export function Receive({ note, files, status, progress, allBusy, onDownloadOne, onDownloadAll }) {
  return (
    <div className={CARD}>
      <StatusBox Icon={Radio} title="Anonymous is streaming you files!" subtitle={(note && note.trim()) || DEFAULT_NOTE} />
      {files.length > 0 && (
        <ScrollFade className="flex max-h-[260px] flex-col gap-[4px]">
          {files.map((f) => (
            <ReceiveRow key={f.id} item={f} status={status[f.id]} progress={progress[f.id]} onDownload={() => onDownloadOne(f.id)} />
          ))}
        </ScrollFade>
      )}
      <button type="button" onClick={onDownloadAll} className={cn(CTA, "w-full")}>
        {allBusy ? "Downloading…" : "Download all"}
      </button>
    </div>
  );
}

// Connecting / error state for the recipient route.
export function ReceiveStatusCard({ variant }) {
  if (variant === "error") {
    return (
      <div className={CARD}>
        <StatusBox Icon={WifiOff} title="Link unavailable" subtitle="This beam may have ended, or the sender went offline." />
      </div>
    );
  }
  return (
    <div className={CARD}>
      <StatusBox Icon={Loader} iconClass="animate-spin text-text [animation-duration:1.1s]" title="Connecting…" subtitle="Linking you to the sender" />
    </div>
  );
}

export function DownloadStarted() {
  return (
    <div className={CARD}>
      <StatusBox Icon={Download} title="Download started" subtitle="Once it's done, go and thank your friend!" />
    </div>
  );
}
