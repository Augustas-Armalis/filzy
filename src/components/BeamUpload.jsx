import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Folder, FileArchive, FileText, FileSpreadsheet, FileCode, File as FileIcon, Headphones } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/files";

const ICON_BY_KIND = {
  archive: FileArchive,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  code: FileCode,
  text: FileText,
  audio: Headphones,
  folder: Folder,
  file: FileIcon,
};

export function Thumb({ item }) {
  const { kind, url } = item;

  if (kind === "image" && url) {
    return <img src={url} alt="" className="h-[42px] w-[42px] shrink-0 rounded-[7px] border border-white/20 object-cover" />;
  }
  if (kind === "video" && url) {
    return (
      <video
        src={url}
        muted
        autoPlay
        loop
        playsInline
        className="h-[42px] w-[42px] shrink-0 rounded-[7px] border border-white/20 object-cover"
      />
    );
  }
  const Icon = ICON_BY_KIND[kind] || FileIcon;
  return (
    <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-border/50 bg-bg">
      <Icon size={22} strokeWidth={1.75} absoluteStrokeWidth className="text-alt-text" />
    </div>
  );
}

export function DropBox({ isDragging, onOpen }) {
  const [overBox, setOverBox] = useState(false);

  return (
    <div
      onClick={onOpen}
      onDragEnter={() => setOverBox(true)}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOverBox(false);
      }}
      onDrop={() => setOverBox(false)}
      className={cn(
        "flex h-[142px] cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[12px] border border-dashed border-border bg-bg transition-all duration-150",
        isDragging ? "border-text bg-bg-hover" : "hover:bg-bg-hover",
        overBox && "border-solid bg-bg-hover",
      )}
    >
      <div className="relative h-[44px] w-[48px]">
        <div className="absolute inset-0 m-auto h-[32px] w-[32px] -translate-x-[2px] translate-y-[4px] -rotate-[15deg] rounded-[9px] border border-border bg-white" />
        <div className="absolute inset-0 m-auto flex h-[32px] w-[32px] translate-x-[6.5px] -translate-y-[-4px] rotate-[15deg] items-center justify-center rounded-[9px] border border-border bg-white">
          <Plus size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" />
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-[0px]">
        <p className="text-[14px] font-medium text-alt-text">{isDragging ? "Drop files to add" : "Add files"}</p>
        <p className="text-[11px] font-medium text-dalt-text">Unlimited file size! Be the server</p>
      </div>
    </div>
  );
}

// Apple-style middle truncation: keep the start + a tail (the extension) always visible.
export function splitName(name) {
  const TAIL = 7;
  if (name.length <= TAIL + 4) return [name, ""];
  return [name.slice(0, -TAIL), name.slice(-TAIL)];
}

export function Row({ item, onRemove }) {
  const isFolder = item.kind === "folder";
  const name = isFolder ? item.name : item.file.name;
  const [head, tail] = splitName(name);

  return (
    <div className="flex items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px] transition-all duration-150">

      <Thumb item={item} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 text-[14px] text-text">
          <span className="truncate">{head}</span>
          {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
        </div>
        {isFolder ? (
          <div className="flex items-center gap-[5px] text-[11px] text-alt-text">
            <span>{item.fileCount} file{item.fileCount === 1 ? "" : "s"}</span>
            <div className="h-[2.5px] w-[2.5px] rounded-full bg-border" />
            <span>{formatBytes(item.size)}</span>
          </div>
        ) : (
          <p className="text-[11px] text-alt-text">{formatBytes(item.file.size)}</p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="group flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] transition-all duration-150 hover:bg-bg-hover"
        >
          <X size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text transition-colors duration-150 group-hover:text-text" />
        </button>
      )}

    </div>
  );
}


export function FileList({ items, onRemove, onOpen, note, setNote, isDragging }) {
  const totalBytes = items.reduce((sum, it) => sum + (it.kind === "folder" ? it.size : it.file.size), 0);

  // Fade the top/bottom edges of the scroll area — only when scrollable, and
  // re-measured through add/remove + layout animations (so it never sticks).
  const scrollRef = useRef(null);
  const [fade, setFade] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const el = scrollRef.current;
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
    const mo = new MutationObserver(recompute);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    return () => {
      el.removeEventListener("scroll", recompute);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  const mask = `linear-gradient(to bottom, transparent 0, #000 ${fade.top}px, #000 calc(100% - ${fade.bottom}px), transparent 100%)`;

  // Solid border while files hover the header box directly.
  const [overHeader, setOverHeader] = useState(false);

  return (
    <div className="flex flex-col gap-[8px]">

      <div
        onDragEnter={() => setOverHeader(true)}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOverHeader(false);
        }}
        onDrop={() => setOverHeader(false)}
        className={cn(
          "w-full rounded-[12px] h-fit border border-dashed border-border bg-bg flex items-center justify-between p-[8px] pl-[12px] transition-all duration-150",
          isDragging && "border-text bg-bg-hover",
          overHeader && "border-solid",
        )}
      >

        {isDragging ? (
          <p className="text-[14px] font-medium text-text">Drop here!</p>
        ) : (
          <div className="w-fit flex flex-row items-center justify-center gap-[5px]">
            <p className="text-[14px] font-medium text-alt-text">{items.length} item{items.length > 1 ? "s" : ""}</p>
            <div className="w-[2.5px] h-[2.5px] bg-border rounded-full"/>
            <p className="text-[14px] font-medium text-alt-text">{formatBytes(totalBytes)}</p>
          </div>
        )}

        <button type="button" onClick={onOpen} className="bg-white rounded-[9px] border-border border h-[30px] pl-[8px] pr-[10px] flex items-center justify-center gap-[5px] cursor-pointer transition-all duration-150 hover:bg-white-hover">
          <Plus size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" />
          <p className="text-[14px] font-medium text-text">Add more</p>
        </button>

      </div>





      <div
        ref={scrollRef}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="flex max-h-[260px] flex-col gap-[4px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
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
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Leave note..."
        maxLength={100}
        className="h-[36px] w-full rounded-[10px] border border-border bg-white px-[10px] text-[14px] text-text outline-none transition-all duration-150 placeholder:text-alt-text focus:border-text/60"
      />
    </div>
  );
}
