import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader, ChevronDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { swap } from "@/lib/motion";

/*
  Shared Filzy design-system primitives. Everything here speaks the same visual
  language as the home page: white/50 glass cards, 9–12px radii, black `text`
  for active/primary, `border`/white for resting, Geist body + Casser display,
  and blur-fade motion. New pages compose these instead of re-inlining Tailwind.
*/

// ---------------------------------------------------------------------------
// GlassCard — the floating white/50 glass panel, with a smoothly animated
// height as its content grows/shrinks (same trick Home.jsx uses).
// ---------------------------------------------------------------------------
export function GlassCard({ children, className, animateHeight = true, width = "max-w-[400px]" }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState();

  useLayoutEffect(() => {
    if (!animateHeight) return;
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight + 2); // +2 for the border
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [animateHeight]);

  return (
    <motion.div
      animate={animateHeight ? { height: height ?? "auto" } : undefined}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-white/20 bg-white/50 backdrop-blur-[16px]",
        width,
        className,
      )}
    >
      <div ref={innerRef} className="flex flex-col gap-[8px] p-[8px]">
        {children}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TabBar — the row of equal-width pill tabs (active = solid black).
// tabs: [{ id, label, Icon }]
// ---------------------------------------------------------------------------
export function TabBar({ tabs, activeId, onChange }) {
  return (
    <div className="flex w-full flex-row items-center justify-center gap-[4px]">
      {tabs.map(({ id, label, Icon }) => {
        const isActive = id === activeId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex h-[32px] w-full cursor-pointer items-center justify-center gap-[4px] rounded-[9px] border transition-all duration-150",
              isActive
                ? "border-text bg-text hover:border-text-hover hover:bg-text-hover"
                : "border-border bg-white hover:bg-white-hover",
            )}
          >
            {Icon && (
              <Icon
                size={16}
                strokeWidth={1.33}
                absoluteStrokeWidth
                className={cn("transition-colors duration-150", isActive ? "text-white" : "text-alt-text")}
              />
            )}
            <span className={cn("text-[14px] transition-colors duration-150", isActive ? "text-white" : "text-alt-text")}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CtaButton — the primary black button with the Casser display label that
// blur-swaps when the label changes. Disabled = dimmed + non-interactive.
// ---------------------------------------------------------------------------
export function CtaButton({ label, onClick, disabled, busy, className }) {
  return (
    <button
      type="button"
      onClick={disabled || busy ? undefined : onClick}
      className={cn(
        "relative flex h-[38px] w-full items-center justify-center rounded-[11px] bg-text transition-all duration-150",
        disabled ? "pointer-events-none opacity-50" : busy ? "pointer-events-none opacity-90" : "cursor-pointer hover:bg-text-hover",
        className,
      )}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={busy ? "busy" : label}
          {...swap}
          className="absolute inset-0 flex items-center justify-center gap-[7px] font-normal font-casser text-[16px] text-white"
        >
          {busy && <Loader size={15} strokeWidth={1.6} absoluteStrokeWidth className="animate-spin text-white" />}
          {busy ? "Working…" : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

// ---------------------------------------------------------------------------
// GhostButton — white bordered secondary button (Add more / Reset style).
// ---------------------------------------------------------------------------
export function GhostButton({ children, onClick, Icon, className, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "flex h-[30px] cursor-pointer items-center justify-center gap-[5px] rounded-[9px] border border-border bg-white pl-[8px] pr-[10px] transition-all duration-150 hover:bg-white-hover",
        className,
      )}
    >
      {Icon && <Icon size={16} strokeWidth={1.17} absoluteStrokeWidth className="text-text" />}
      <span className="text-[14px] text-text">{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// StackIcon — the two-offset-cards motif used across empty/loading states.
// ---------------------------------------------------------------------------
export function StackIcon({ Icon, spin = false }) {
  return (
    <div className="relative h-[44px] w-[48px]">
      <div className="absolute inset-0 m-auto h-[32px] w-[32px] -translate-x-[2px] translate-y-[4px] -rotate-[15deg] rounded-[9px] border border-border bg-white" />
      <div className="absolute inset-0 m-auto flex h-[32px] w-[32px] translate-x-[6.5px] translate-y-[4px] rotate-[15deg] items-center justify-center rounded-[9px] border border-border bg-white">
        <Icon
          size={16}
          strokeWidth={1.17}
          absoluteStrokeWidth
          className={cn("text-text", spin && "animate-spin")}
          style={spin ? { animationDuration: "2.4s" } : undefined}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropzone — generalized dashed drop area (Home's DropBox, parameterized).
// ---------------------------------------------------------------------------
export function Dropzone({ isDragging, onOpen, Icon, title, subtitle, dragTitle = "Drop to add", height = "h-[142px]" }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={onOpen}
      onDragEnter={() => setOver(true)}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={() => setOver(false)}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[12px] border border-dashed border-border bg-bg transition-all duration-150",
        height,
        isDragging ? "border-text bg-bg-hover" : "hover:bg-bg-hover",
        over && "border-solid bg-bg-hover",
      )}
    >
      <StackIcon Icon={Icon} />
      <div className="flex flex-col items-center justify-center">
        <p className="text-[14px] text-alt-text">{isDragging ? dragTitle : title}</p>
        {subtitle && <p className="text-[11px] text-dalt-text">{subtitle}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented — small equal-width toggle (e.g. "MB | %", quality presets).
// options: [{ id, label }]
// ---------------------------------------------------------------------------
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn("flex w-full items-center gap-[3px] rounded-[10px] border border-border bg-bg p-[3px]", className)}>
      {options.map((o) => {
        const isActive = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex h-[28px] w-full cursor-pointer items-center justify-center rounded-[7px] text-[13px] transition-all duration-150",
              isActive ? "bg-white text-text shadow-sm" : "text-alt-text hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar — thin black-fill progress inside a bg track. value: 0..1
// ---------------------------------------------------------------------------
export function ProgressBar({ value, className }) {
  return (
    <div className={cn("h-[6px] w-full overflow-hidden rounded-full bg-border/60", className)}>
      <motion.div
        className="h-full rounded-full bg-text"
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormatMenu — a compact searchable dropdown for choosing an output format.
// options: [{ value, label }]. Renders a trigger + popup list.
// ---------------------------------------------------------------------------
export function FormatMenu({ value, options, onChange, placeholder = "Format", disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState(null); // trigger position for the portal
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  // Measure the trigger so the portaled popup can sit right under it, and decide
  // whether to drop up when there isn't room below.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setRect({ left: r.left, top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, width: r.width, openUp: below < 240 });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const reposition = () => setOpen(false); // simplest: close on scroll/resize
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.value.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[36px] w-full items-center justify-between rounded-[10px] border border-border bg-white px-[10px] transition-all duration-150",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white-hover",
        )}
      >
        <span className={cn("text-[14px]", selected ? "text-text" : "text-alt-text")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} strokeWidth={1.5} absoluteStrokeWidth className={cn("text-alt-text transition-transform duration-150", open && "rotate-180")} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: rect.openUp ? 4 : -4, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: rect.openUp ? 4 : -4, filter: "blur(6px)" }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: "fixed",
                left: rect.left,
                width: Math.max(rect.width, 168),
                ...(rect.openUp ? { bottom: rect.bottom } : { top: rect.top }),
                zIndex: 80,
              }}
              className="overflow-hidden rounded-[12px] border border-border bg-white/90 shadow-xl backdrop-blur-[20px]"
            >
              {options.length > 6 && (
                <div className="flex items-center gap-[6px] border-b border-border px-[10px] py-[8px]">
                  <Search size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-alt-text" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-[13px] text-text outline-none placeholder:text-dalt-text"
                  />
                </div>
              )}
              <div className="max-h-[224px] overflow-y-auto p-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filtered.length === 0 && <p className="px-[8px] py-[10px] text-[13px] text-alt-text">No match</p>}
                {filtered.map((o) => {
                  const isSel = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex h-[34px] w-full items-center justify-between rounded-[8px] px-[9px] text-[14px] transition-all duration-150",
                        isSel ? "bg-bg text-text" : "text-alt-text hover:bg-bg hover:text-text",
                      )}
                    >
                      <span>{o.label}</span>
                      {isSel && <Check size={15} strokeWidth={1.75} absoluteStrokeWidth className="text-text" />}
                    </button>
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
