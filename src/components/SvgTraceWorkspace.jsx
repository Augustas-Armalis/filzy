import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Contrast, Eraser, Image as ImageIcon, Palette, PenTool } from "lucide-react";
import { FormatMenu, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { traceImageToSvg, SVG_FILTERS, SVG_TRACE_QUALITIES } from "@/lib/svgTrace";

function TraceToggle({ active, onClick, Icon, label }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-[36px] min-w-0 cursor-pointer touch-manipulation items-center justify-center gap-[5px] rounded-[9px] border px-[8px] text-[11px] transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
        active ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-white-hover hover:text-text",
      )}
    >
      <Icon size={14} strokeWidth={1.4} absoluteStrokeWidth aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function SvgTraceControls({ value, onChange, compact = false }) {
  const patch = (next) => onChange({ ...value, ...next });
  const setQuality = (svgQuality) => {
    const { svgDetail: _legacyDetail, svgResolution: _legacyResolution, ...current } = value;
    onChange({ ...current, svgQuality });
  };
  return (
    <div className={cn("grid gap-[5px]", compact ? "sm:grid-cols-2" : "sm:grid-cols-[1fr_1fr_1.1fr]")}>
      <div className="min-w-0">
        <FormatMenu
          value={value.svgQuality || "fine"}
          options={SVG_TRACE_QUALITIES.map(({ id, label }) => ({ value: id, label }))}
          onChange={setQuality}
          placeholder="Trace quality"
        />
      </div>
      <div className="min-w-0">
        <FormatMenu value={value.svgFilter || "edge2"} options={SVG_FILTERS.map(({ id, label }) => ({ value: id, label }))} onChange={(svgFilter) => patch({ svgFilter })} placeholder="Filter" />
      </div>
      <Segmented
        value={String(value.svgColors || 2)}
        onChange={(svgColors) => patch({ svgColors: Number(svgColors), svgMonochrome: Number(svgColors) === 2 ? value.svgMonochrome : false })}
        options={[{ id: "2", label: "2 colors" }, { id: "4", label: "4" }, { id: "8", label: "8" }, { id: "16", label: "16" }]}
      />
      <div className={cn("grid grid-cols-3 gap-[5px]", !compact && "sm:col-span-2")}>
        <TraceToggle active={Boolean(value.svgTransparent)} onClick={() => patch({ svgTransparent: !value.svgTransparent })} Icon={Eraser} label="Transparent" />
        <TraceToggle active={Boolean(value.svgInvert)} onClick={() => patch({ svgInvert: !value.svgInvert })} Icon={Contrast} label="Invert" />
        <TraceToggle active={Boolean(value.svgMonochrome)} onClick={() => patch({ svgMonochrome: !value.svgMonochrome })} Icon={Palette} label="One color" />
      </div>
      <label className="flex h-[36px] cursor-pointer items-center gap-[7px] rounded-[9px] border border-border bg-white px-[8px] transition-colors hover:bg-white-hover focus-within:ring-2 focus-within:ring-text/20">
        <input aria-label="SVG path color" name="svg-path-color" type="color" value={value.svgColor || "#111111"} onChange={(event) => patch({ svgColor: event.target.value, svgMonochrome: true })} className="h-[22px] w-[22px] cursor-pointer rounded-[5px] border-0 bg-transparent p-0 focus-visible:outline-none" />
        <span className="min-w-0 truncate text-[11px] text-alt-text">Path color</span>
        <span className="ml-auto text-[10px] uppercase text-dalt-text">{value.svgColor || "#111111"}</span>
      </label>
    </div>
  );
}

function PreviewPanel({ title, icon: Icon, children, footer, ready, busy }) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-white">
      <div className="flex h-[34px] items-center gap-[6px] border-b border-border px-[9px]">
        <Icon size={14} strokeWidth={1.4} absoluteStrokeWidth className="text-alt-text" />
        <span className="text-[11px] text-alt-text">{title}</span>
        {busy ? <span className="ml-auto h-[5px] w-[5px] animate-pulse rounded-full bg-alt-text" /> : ready ? <Check size={12} strokeWidth={2} absoluteStrokeWidth className="ml-auto text-green-600" /> : null}
      </div>
      <div
        className="relative flex h-[260px] items-center justify-center overflow-hidden p-[12px]"
        style={{
          backgroundColor: "#f8f8f8",
          backgroundImage: "linear-gradient(45deg,#ececec 25%,transparent 25%),linear-gradient(-45deg,#ececec 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ececec 75%),linear-gradient(-45deg,transparent 75%,#ececec 75%)",
          backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
          backgroundSize: "12px 12px",
        }}
      >
        {children}
      </div>
      <div aria-live="polite" className="flex h-[30px] items-center justify-between border-t border-border bg-bg px-[9px] text-[10px] text-alt-text">{footer}</div>
    </div>
  );
}

export function SvgTraceWorkspace({ item, value, onChange, disabled = false }) {
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("Preparing preview…");
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(true);
  const lastUrl = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setUpdating(true);
    setStatus("Updating preview…");
    const timer = window.setTimeout(async () => {
      setError(null);
      try {
        const result = await traceImageToSvg(item.file, {
          ...value,
          svgPreview: true,
          signal: controller.signal,
          onStatus: setStatus,
        });
        if (controller.signal.aborted) return;
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        const url = URL.createObjectURL(result.blob);
        lastUrl.current = url;
        setPreview({ ...result, url, paths: (result.svg.match(/<path\b/g) || []).length });
        setStatus("");
        setUpdating(false);
      } catch (nextError) {
        if (nextError?.name !== "AbortError") {
          setError(nextError?.message || "Could not create the SVG preview");
          setStatus("");
          setUpdating(false);
        }
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [item.file, value]);

  useEffect(() => () => lastUrl.current && URL.revokeObjectURL(lastUrl.current), []);

  return (
    <div className={cn("border-t border-border/80 bg-bg/70 p-[6px] transition-opacity", disabled && "pointer-events-none opacity-60")}>
      <div className="mb-[6px] rounded-[11px] border border-border bg-bg p-[5px]">
        <SvgTraceControls value={value} onChange={onChange} />
      </div>
      <div className="grid gap-[6px] md:grid-cols-2">
        <PreviewPanel title="Original image" icon={ImageIcon} footer={<><span>Raster source</span><span>{item.file.name}</span></>}>
          <img src={item.url} alt="Original" className="max-h-full max-w-full rounded-[6px] object-contain shadow-sm" />
        </PreviewPanel>
        <PreviewPanel title="Vector preview" icon={PenTool} busy={updating} ready={Boolean(preview)} footer={<><span>{updating ? status || "Updating preview…" : preview ? `${preview.paths} paths` : status || "Preview"}</span><span>{preview ? `${preview.width} × ${preview.height}` : "SVG"}</span></>}>
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.img key={preview.url} src={preview.url} alt="Vector preview" initial={{ opacity: 0, filter: "blur(8px)", scale: 0.985 }} animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }} exit={{ opacity: 0, filter: "blur(8px)" }} transition={{ duration: 0.2 }} className="max-h-full max-w-full object-contain" />
            ) : (
              <motion.div key="loading" className="flex flex-col items-center gap-[7px] text-center">
                <PenTool size={20} strokeWidth={1.2} absoluteStrokeWidth className="animate-pulse text-alt-text" />
                <span className={cn("text-[11px]", error ? "text-red-600" : "text-alt-text")}>{error || status}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </PreviewPanel>
      </div>
    </div>
  );
}
