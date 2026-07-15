import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Captions,
  Check,
  ChevronDown,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Monitor,
  Music2,
  PenTool,
  Ruler,
  Search,
  Type,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { FORMAT_GROUP_META, FORMAT_GROUPS, POPULAR_FORMAT_VALUES } from "@/lib/formats";

const GROUP_ICONS = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music2,
  spreadsheet: FileSpreadsheet,
  presentation: Monitor,
  ebook: BookOpen,
  archive: FileArchive,
  vector: PenTool,
  cad: Ruler,
  font: Type,
  subtitle: Captions,
};

const TABS = [
  { id: "all", label: "All" },
  { id: "popular", label: "Popular" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

const POPULAR_RANK = new Map(POPULAR_FORMAT_VALUES.map((value, index) => [value, index]));

function sortFormats(formats) {
  return [...formats].sort((a, b) => {
    if (Boolean(a.disabled) !== Boolean(b.disabled)) return a.disabled ? 1 : -1;
    const aRank = POPULAR_RANK.get(a.value) ?? 999;
    const bRank = POPULAR_RANK.get(b.value) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return a.label.localeCompare(b.label);
  });
}

export function FormatGlyph({ format, size = 18, className }) {
  const Icon = format ? GROUP_ICONS[format.group] || File : File;
  return <Icon size={size} strokeWidth={1.35} absoluteStrokeWidth className={cn("text-alt-text", className)} />;
}

function sectionFor(id, formats) {
  return {
    id,
    label: FORMAT_GROUP_META[id]?.label || id,
    formats: sortFormats(formats.filter((format) => format.group === id)),
  };
}

export function ConvertFormatPicker({
  value,
  options,
  onChange,
  label,
  placeholder = "Any",
  allowAny = false,
  disabled = false,
  variant = "compact",
  className,
  ariaLabel,
  availableLabel = "Available conversions",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const selected = options.find((format) => format.value === value) || null;
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return [{
        id: "results",
        label: "Search results",
        formats: sortFormats(options.filter((format) => format.label.toLowerCase().includes(q) || format.value.toLowerCase().includes(q))),
      }];
    }
    if (tab === "popular") {
      const byValue = Object.fromEntries(options.map((format) => [format.value, format]));
      return [{ id: "popular", label: "Popular formats", formats: sortFormats(POPULAR_FORMAT_VALUES.map((value) => byValue[value]).filter(Boolean)) }];
    }
    if (tab === "image") return [{
      id: "image",
      label: "Image & vector formats",
      formats: sortFormats(options.filter((format) => format.group === "image" || format.group === "vector")),
    }];
    if (tab === "video") return [sectionFor("video", options)];
    if (tab === "audio") return [sectionFor("audio", options)];
    if (options.some((format) => format.disabled)) {
      const available = { id: "available", label: availableLabel, formats: sortFormats(options.filter((format) => !format.disabled)) };
      const later = FORMAT_GROUPS
        .map(({ id }) => sectionFor(id, options.filter((format) => format.disabled)))
        .filter((section) => section.formats.length);
      return [available, ...later];
    }
    return FORMAT_GROUPS
      .map(({ id }) => sectionFor(id, options))
      .filter((section) => section.formats.length)
      .sort((a, b) => Number(!a.formats.some((format) => !format.disabled)) - Number(!b.formats.some((format) => !format.disabled)));
  }, [availableLabel, options, query, tab]);
  const visibleCount = sections.reduce((sum, section) => sum + section.formats.length, 0);

  const place = () => {
    const element = triggerRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 20);
    const left = Math.max(10, Math.min(bounds.left, window.innerWidth - width - 10));
    const below = window.innerHeight - bounds.bottom;
    const above = bounds.top;
    const openUp = above > below;
    const available = Math.max(above, below);
    const scrollHeight = Math.max(170, Math.min(360, available - 96));
    setRect({ left, width, top: bounds.bottom + 6, bottom: window.innerHeight - bounds.top + 6, openUp, scrollHeight });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (triggerRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    let frame = null;
    const reposition = (event) => {
      // The popup is anchored UI. Page scrolling keeps it open and moves it
      // with its trigger; scrolling inside the catalog should do nothing but
      // scroll the catalog itself.
      if (event?.type === "scroll" && popupRef.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    setQuery("");
    setTab("all");
  };

  const hero = variant === "hero";
  const displayLabel = value === "any" ? "Any" : selected?.label || placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || `${label || "Format"}: ${displayLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "group flex w-full items-center border border-border bg-white text-left transition-all duration-150",
          hero
            ? "h-[60px] gap-[7px] rounded-[12px] px-[8px] hover:bg-white-hover sm:h-[62px] sm:px-[9px]"
            : "h-[34px] gap-[5px] rounded-[9px] px-[7px] hover:bg-white-hover",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          open && "border-text/45",
          className,
        )}
      >
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-[8px] border border-border/70 bg-bg",
          hero ? "h-[34px] w-[34px]" : "h-[22px] w-[22px]",
        )}>
          <FormatGlyph format={selected} size={hero ? 18 : 14} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {label && <span className={cn("text-alt-text", hero ? "text-[11px]" : "text-[10px]")}>{label}</span>}
          <span className={cn("truncate text-text", hero ? "text-[14px]" : "text-[13px]")}>{displayLabel}</span>
        </div>
        <ChevronDown size={hero ? 16 : 14} strokeWidth={1.5} absoluteStrokeWidth className={cn("shrink-0 text-alt-text transition-transform duration-150", open && "rotate-180")} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={popupRef}
              role="dialog"
              aria-label={`${label || "Format"} picker`}
              initial={{ opacity: 0, y: rect.openUp ? 5 : -5, filter: "blur(7px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: rect.openUp ? 5 : -5, filter: "blur(7px)" }}
              transition={{ duration: 0.17, ease: "easeOut" }}
              style={{
                position: "fixed",
                left: rect.left,
                width: rect.width,
                ...(rect.openUp ? { bottom: rect.bottom } : { top: rect.top }),
                zIndex: 90,
              }}
              className="overflow-hidden rounded-[12px] border border-white/60 bg-white/92 shadow-2xl backdrop-blur-[22px]"
            >
              <div className="flex items-center gap-[7px] border-b border-border px-[10px] py-[8px]">
                <Search size={15} strokeWidth={1.4} absoluteStrokeWidth className="shrink-0 text-alt-text" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search formats…"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-dalt-text"
                />
                <span className="text-[10px] tabular-nums text-dalt-text">{visibleCount}</span>
              </div>

              <div className="flex gap-[3px] border-b border-border/80 p-[5px]">
                {TABS.map(({ id, label: tabLabel }) => {
                  const active = id === tab;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTab(id)}
                      className={cn(
                        "flex h-[30px] flex-1 cursor-pointer select-none items-center justify-center rounded-[8px] px-[5px] text-[12px] outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-text/20 active:scale-[0.98]",
                        active ? "bg-text text-white" : "text-alt-text hover:bg-bg hover:text-text",
                      )}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
              </div>

              <div style={{ maxHeight: rect.scrollHeight }} className="overflow-y-auto overscroll-contain p-[6px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {allowAny && !query && tab === "all" && (
                  <button
                    type="button"
                    onClick={() => choose("any")}
                    className={cn(
                      "mb-[7px] flex h-[48px] w-full cursor-pointer select-none items-center gap-[8px] rounded-[9px] border px-[8px] text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-text/20 active:scale-[0.99]",
                      value === "any" ? "border-text/20 bg-bg" : "border-border bg-white hover:bg-bg",
                    )}
                  >
                    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-border bg-white">
                      <File size={15} strokeWidth={1.35} absoluteStrokeWidth className="text-alt-text" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] text-text">Any format</span>
                      <span className="text-[10px] text-alt-text">Detect automatically from each file</span>
                    </div>
                    {value === "any" && <Check size={15} strokeWidth={1.7} absoluteStrokeWidth className="text-text" />}
                  </button>
                )}

                {visibleCount === 0 ? (
                  <p className="px-[8px] py-[22px] text-center text-[13px] text-alt-text">No matching format</p>
                ) : sections.map((section) => {
                  const SectionIcon = section.id === "available" ? Check : GROUP_ICONS[section.id] || File;
                  return (
                    <section key={section.id} className="mb-[9px] last:mb-0">
                      <div className="mb-[5px] flex items-center gap-[5px] px-[2px]">
                        <SectionIcon size={13} strokeWidth={1.4} absoluteStrokeWidth className="text-alt-text" />
                        <p className="text-[11px] text-alt-text">{section.label}</p>
                        <span className="text-[10px] text-dalt-text">{section.formats.length}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-[4px]">
                        {section.formats.map((format) => {
                          const active = format.value === value;
                          return (
                            <button
                              key={`${section.id}-${format.value}`}
                              type="button"
                              disabled={format.disabled}
                              title={format.disabled ? "Coming soon" : format.label}
                              onClick={() => choose(format.value)}
                              className={cn(
                                "group/format flex h-[48px] min-w-0 select-none items-center gap-[7px] rounded-[9px] border px-[7px] text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-text/20",
                                active ? "border-text/20 bg-bg" : "border-border/80 bg-white",
                                format.disabled ? "cursor-not-allowed opacity-35" : "cursor-pointer hover:border-border hover:bg-bg active:scale-[0.98]",
                              )}
                            >
                              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border border-border/70 bg-white">
                                <FormatGlyph format={format} size={14} />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-[12px] text-text">{format.label}</span>
                                {format.disabled && <span className="text-[8px] text-alt-text">Soon</span>}
                              </div>
                              {active && <Check size={13} strokeWidth={1.7} absoluteStrokeWidth className="shrink-0 text-text" />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
