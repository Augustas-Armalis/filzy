import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Download, FolderArchive, Plus, RefreshCw, Settings2, X } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { SeoLandingContent } from "@/components/SeoContent";
import { GlassCard, CtaButton, GhostButton, Dropzone, ProgressBar } from "@/components/ui";
import { ConvertFormatPicker, FormatGlyph } from "@/components/ConvertFormatPicker";
import { ConversionSettings, defaultConversionSettings } from "@/components/ConversionSettings";
import { SvgTraceWorkspace } from "@/components/SvgTraceWorkspace";
import { Thumb, splitName } from "@/components/BeamUpload";
import { cn } from "@/lib/cn";
import { seoPageForPath } from "@/content/seoCatalog";
import { row as rowMotion, fade } from "@/lib/motion";
import { formatBytes, kindOf, gatherDropItems } from "@/lib/files";
import { zipSync, downloadBlob } from "@/lib/zip";
import { pageJsonLd, useSeo, toolJsonLd } from "@/lib/seo";
import {
  FORMATS,
  acceptForFormat,
  catalogFormatByValue,
  categoryOf,
  enabledOutputValuesForFile,
  fileMatchesFormat,
  formatByValue,
  outputsFor,
  outputValuesForSourceValue,
  pickerCatalog,
  sourceValueOf,
} from "@/lib/formats";
import { convertFile } from "@/lib/convert";

let uid = 0;
const SETTINGS_STORAGE_KEY = "filzy:conversion-settings:v2";

function storedSettings(target) {
  if (typeof window === "undefined" || !target) return {};
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}")[target] || {};
  } catch {
    return {};
  }
}

function rememberSettings(target, settings) {
  if (typeof window === "undefined" || !target) return;
  try {
    const current = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...current, [target]: settings }));
  } catch {
    /* Private browsing/storage limits should never block conversion. */
  }
}

function selectionCategory(value) {
  return formatByValue(value)?.category || catalogFormatByValue(value)?.category || null;
}

function targetCategory(file, target) {
  return formatByValue(target)?.category || categoryOf(file);
}

function settingsFor(file, target) {
  const saved = storedSettings(target);
  const settings = { ...defaultConversionSettings(targetCategory(file, target), target), ...saved };
  if (target === "svg" && !saved.svgQuality) {
    if (saved.svgResolution === "original" || saved.svgDetail === "maximum") settings.svgQuality = "max";
    else if (Number(saved.svgResolution) > 0 && Number(saved.svgResolution) <= 900) settings.svgQuality = "fast";
  }
  return settings;
}

function outputValuesForSource(source) {
  const values = outputValuesForSourceValue(source);
  if (source === "gif") FORMATS.filter((format) => format.category === "video").forEach((format) => values.add(format.value));
  if (source && source !== "any") values.add(source);
  return values;
}

function defaultTargetFor(file, preferred) {
  const enabled = enabledOutputValuesForFile(file);
  if (preferred && preferred !== "any" && enabled.has(preferred)) return preferred;
  const source = sourceValueOf(file);
  const alternate = outputsFor(categoryOf(file)).find((option) => option.value !== source);
  return alternate?.value || source;
}

function makeItem(file, preferred) {
  const kind = kindOf(file);
  const url = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
  const target = defaultTargetFor(file, preferred);
  return {
    id: ++uid,
    file,
    kind,
    url,
    target,
    settings: settingsFor(file, target),
    settingsOpen: false,
    status: "idle",
    progress: 0,
    statusText: "",
    result: null,
    error: null,
  };
}

function FormatChip({ value, tone = "neutral", label }) {
  const format = catalogFormatByValue(value) || { value, label: String(value || "FILE").toUpperCase(), group: "document" };
  return (
    <div className={cn(
      "flex h-[34px] shrink-0 items-center gap-[5px] rounded-[9px] px-[5px]",
      tone === "success" ? "border border-green-200 bg-green-50 px-[7px] text-green-700" : "text-text",
    )}>
      <FormatGlyph format={format} size={14} className={tone === "success" ? "text-green-600" : "text-alt-text"} />
      <span className="truncate text-[12px] uppercase">{label || format.label}</span>
      {tone === "success" && <Check size={12} strokeWidth={2} absoluteStrokeWidth className="ml-auto shrink-0 text-green-600" />}
    </div>
  );
}

function ScrollFadeList({ children, expanded = false }) {
  const ref = useRef(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => {
      setFadeTop(element.scrollTop > 2);
      setFadeBottom(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    const mutations = new MutationObserver(update);
    resize.observe(element);
    mutations.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener("scroll", update);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);

  const mask = fadeTop && fadeBottom
    ? "linear-gradient(to bottom, transparent 0, black 22px, black calc(100% - 22px), transparent 100%)"
    : fadeTop
      ? "linear-gradient(to bottom, transparent 0, black 22px, black 100%)"
      : fadeBottom
        ? "linear-gradient(to bottom, black 0, black calc(100% - 22px), transparent 100%)"
        : undefined;

  return (
    <div ref={ref} className={cn("flex flex-col gap-[4px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", expanded ? "max-h-[590px]" : "max-h-[520px]")} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {children}
    </div>
  );
}

function ConvertRow({ item, onRemove, onRetarget, onSettings, onToggleSettings, onCancel }) {
  const outputOptions = useMemo(() => pickerCatalog(enabledOutputValuesForFile(item.file)), [item.file]);
  const [head, tail] = splitName(item.file.name);
  const working = item.status === "working";
  const done = item.status === "done";
  const settingCategory = targetCategory(item.file, item.target);
  const svgMode = item.target === "svg" && categoryOf(item.file) === "image";

  return (
    <div className={cn("overflow-hidden rounded-[12px] border bg-white transition-colors", item.status === "error" ? "border-red-200" : done ? "border-green-200" : "border-border")}>
      <div className="flex flex-col gap-[7px] p-[6px] sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-[8px] sm:flex-1">
          <Thumb item={item} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 text-[13px] leading-[18px] text-text">
              <span className="truncate">{head}</span>
              {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
            </div>
            <span className="text-[10px] leading-[14px] text-alt-text">{formatBytes(item.file.size)}</span>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-[4px] sm:ml-auto">
          <FormatChip value={sourceValueOf(item.file)} />
          <span className="flex h-[34px] w-[18px] shrink-0 items-center justify-center">
            <RefreshCw size={13} strokeWidth={1.4} absoluteStrokeWidth className="text-dalt-text" />
          </span>
          {done ? (
            <FormatChip value={item.target} tone="success" />
          ) : (
            <div className="w-[110px] min-w-0">
              <ConvertFormatPicker value={item.target} options={outputOptions} onChange={(value) => onRetarget(item.id, value)} disabled={working} ariaLabel={`Output format for ${item.file.name}`} availableLabel={`Available from ${sourceValueOf(item.file).toUpperCase()}`} />
            </div>
          )}

          {done ? (
            <button type="button" onClick={() => downloadBlob(item.result.name, item.result.blob)} className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-text transition-colors hover:bg-text-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20" aria-label={`Download ${item.result.name}`}>
              <Download size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-white" />
            </button>
          ) : !svgMode ? (
            <button
              type="button"
              onClick={() => onToggleSettings(item.id)}
              disabled={working}
              className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20", item.settingsOpen ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-white-hover hover:text-text", working ? "cursor-not-allowed opacity-45" : "cursor-pointer")}
              aria-label={`Conversion settings for ${item.file.name}`}
              aria-expanded={item.settingsOpen}
            >
              <Settings2 size={15} strokeWidth={1.45} absoluteStrokeWidth />
            </button>
          ) : null}

          <button
            type="button"
            onClick={working ? onCancel : () => onRemove(item.id)}
            className="group flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] transition-all hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
            aria-label={working ? "Cancel conversion" : `Remove ${item.file.name}`}
          >
            <X size={14} strokeWidth={1.2} absoluteStrokeWidth className={cn("transition-colors group-hover:text-text", working ? "text-red-500" : "text-alt-text")} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {working && (
          <motion.div key="working" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <div className="flex items-center gap-[9px] border-t border-border/80 px-[8px] py-[7px]">
              <ProgressBar value={item.progress} className="flex-1" />
              <span className="w-[112px] truncate text-right text-[10px] tabular-nums text-alt-text">{item.statusText || `${Math.round(item.progress * 100)}%`}</span>
            </div>
          </motion.div>
        )}
        {done && (
          <motion.div key="done" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <div className="flex items-center justify-between border-t border-green-100 bg-green-50/40 px-[8px] py-[7px] text-[10px] text-alt-text">
              <span className="flex items-center gap-[5px]"><Check size={12} strokeWidth={2} className="text-green-600" />Converted</span>
              <span>{formatBytes(item.result.blob.size)}</span>
            </div>
          </motion.div>
        )}
        {item.status === "error" && (
          <motion.div key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <div className="flex items-center gap-[6px] border-t border-red-100 bg-red-50/60 px-[8px] py-[7px] text-[10px] text-red-600">
              <AlertCircle size={12} strokeWidth={1.6} />
              <span className="truncate">{item.error || "Conversion failed"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {svgMode && (
        <SvgTraceWorkspace item={item} value={item.settings} onChange={(settings) => onSettings(item.id, settings)} disabled={working} />
      )}

      <AnimatePresence initial={false}>
        {item.settingsOpen && !done && !svgMode && (
          <motion.div initial={{ opacity: 0, height: 0, filter: "blur(6px)" }} animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }} exit={{ opacity: 0, height: 0, filter: "blur(6px)" }} transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
            <div className={cn("border-t border-border/80 bg-bg/70 p-[6px] transition-opacity", working && "pointer-events-none opacity-60")}>
              <ConversionSettings category={settingCategory} target={item.target} value={item.settings} onChange={(settings) => onSettings(item.id, settings)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Convert() {
  const { pair } = useParams();
  const [routeFrom, routeTo] = useMemo(() => {
    if (!pair) return [null, null];
    const parts = pair.toLowerCase().split(/-to-|-2-|_to_/);
    return [catalogFormatByValue(parts[0])?.value || null, catalogFormatByValue(parts[1])?.value || null];
  }, [pair]);

  const [sourceFormat, setSourceFormat] = useState(routeFrom || "any");
  const [globalTarget, setGlobalTarget] = useState(routeTo || "any");
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [swapTurn, setSwapTurn] = useState(0);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const controllerRef = useRef(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    setSourceFormat(routeFrom || "any");
    setGlobalTarget(routeTo || "any");
  }, [routeFrom, routeTo]);

  const hasFiles = items.length > 0;
  const allDone = hasFiles && items.every((item) => item.status === "done");
  const hasSvgWorkspace = items.some((item) => item.target === "svg" && categoryOf(item.file) === "image");
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const inputOptions = useMemo(() => pickerCatalog([], "input"), []);
  const outputOptions = useMemo(() => {
    const enabled = sourceFormat === "any" ? new Set(FORMATS.map((format) => format.value)) : outputValuesForSource(sourceFormat);
    return pickerCatalog(enabled);
  }, [sourceFormat]);
  const selectedSourceLabel = sourceFormat === "any" ? null : catalogFormatByValue(sourceFormat)?.label || sourceFormat.toUpperCase();

  const fromLabel = routeFrom ? catalogFormatByValue(routeFrom)?.label : null;
  const toLabel = routeTo ? catalogFormatByValue(routeTo)?.label : null;
  const seoTitle = fromLabel && toLabel ? `${fromLabel} to ${toLabel} converter` : "Free file converter";
  const seoDescription = fromLabel && toLabel ? `Convert ${fromLabel} to ${toLabel} locally in your browser.` : "Convert files locally in your browser with format-specific settings.";
  const path = pair ? `/convert/${pair}` : "/convert";
  const seoPage = seoPageForPath(path);
  useSeo({
    title: seoPage?.title || seoTitle,
    description: seoPage?.description || seoDescription,
    path,
    robots: pair && !seoPage ? "noindex, follow" : undefined,
    jsonLd: seoPage ? pageJsonLd(seoPage) : toolJsonLd({ name: seoTitle, description: seoDescription, path }),
  });

  const openPicker = () => inputRef.current?.click();
  const patchItem = (id, data) => setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...data } : item)));

  const addFiles = (files) => {
    const next = Array.from(files).filter((file) => fileMatchesFormat(file, sourceFormat)).map((file) => makeItem(file, globalTarget));
    if (next.length) setItems((previous) => [...previous, ...next]);
  };

  const onInputChange = (event) => {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  };

  const removeItem = (id) => {
    setItems((previous) => {
      const item = previous.find((candidate) => candidate.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      return previous.filter((candidate) => candidate.id !== id);
    });
  };

  const updateSettings = (id, settings) => {
    setItems((previous) => previous.map((item) => {
      if (item.id !== id) return item;
      rememberSettings(item.target, settings);
      return { ...item, settings, status: "idle", result: null, error: null, progress: 0 };
    }));
  };

  const retarget = (id, target) => {
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, target, settings: settingsFor(item.file, target), settingsOpen: false, status: "idle", result: null, error: null, progress: 0 } : item));
  };

  const applySource = (value) => {
    setSourceFormat(value);
    const allowed = value === "any" ? new Set(FORMATS.map((format) => format.value)) : outputValuesForSource(value);
    if (globalTarget !== "any" && !allowed.has(globalTarget)) setGlobalTarget("any");
  };

  const applyGlobalTarget = (target) => {
    setGlobalTarget(target);
    setItems((previous) => previous.map((item) => {
      const enabled = enabledOutputValuesForFile(item.file);
      const nextTarget = target === "any" ? defaultTargetFor(item.file, null) : enabled.has(target) ? target : item.target;
      if (nextTarget === item.target) return item;
      return { ...item, target: nextTarget, settings: settingsFor(item.file, nextTarget), settingsOpen: false, status: "idle", result: null, error: null, progress: 0 };
    }));
  };

  const swapFormats = () => {
    const nextSource = globalTarget;
    const nextTarget = sourceFormat;
    setSourceFormat(nextSource);
    setGlobalTarget(nextTarget);
    setSwapTurn((turn) => turn + 1);
    if (nextTarget !== "any") applyGlobalTarget(nextTarget);
  };

  const cancelAll = () => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setItems((previous) => previous.map((item) => item.status === "working" || item.status === "error" ? {
      ...item,
      status: "idle",
      progress: 0,
      statusText: "",
      error: null,
    } : item));
    setBusy(false);
  };

  const runAll = async () => {
    const controller = new AbortController();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    controllerRef.current = controller;
    setBusy(true);
    const active = () => !controller.signal.aborted && runIdRef.current === runId;
    const patchActive = (id, data) => {
      if (active()) patchItem(id, data);
    };
    try {
      for (const item of items) {
        if (!active()) break;
        if (item.status === "done" || !item.target) continue;
        patchActive(item.id, { status: "working", progress: 0, error: null, statusText: "Converting…" });
        try {
          const result = await convertFile(item.file, item.target, {
            ...item.settings,
            signal: controller.signal,
            onStatus: (statusText) => patchActive(item.id, { statusText }),
            onProgress: (progress) => patchActive(item.id, { progress }),
          });
          if (!active()) break;
          patchActive(item.id, { status: "done", progress: 1, statusText: "", result });
        } catch (error) {
          if (error?.name === "AbortError" || !active()) break;
          patchActive(item.id, { status: "error", error: error?.message || "Conversion failed", statusText: "" });
        }
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (runIdRef.current === runId) setBusy(false);
    }
  };

  const completedItems = () => items.filter((item) => item.status === "done" && item.result);

  const downloadIndividually = () => {
    const done = completedItems();
    done.forEach((item, index) => {
      window.setTimeout(() => downloadBlob(item.result.name, item.result.blob), index * 140);
    });
  };

  const downloadZip = () => {
    const done = completedItems();
    if (done.length === 0) return;
    Promise.all(done.map(async (item) => ({ name: item.result.name, bytes: new Uint8Array(await item.result.blob.arrayBuffer()) }))).then((entries) => {
      const seen = {};
      for (const entry of entries) {
        if (seen[entry.name] != null) {
          seen[entry.name] += 1;
          entry.name = entry.name.replace(/(\.[^.]+)$/, `-${seen[entry.name]}$1`);
        } else seen[entry.name] = 0;
      }
      downloadBlob("filzy-converted.zip", zipSync(entries));
    });
  };

  useEffect(() => {
    const hasFilesDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    const enter = (event) => {
      if (!hasFilesDrag(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };
    const over = (event) => hasFilesDrag(event) && event.preventDefault();
    const leave = (event) => {
      if (!hasFilesDrag(event)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) { dragDepth.current = 0; setIsDragging(false); }
    };
    const drop = async (event) => {
      if (!hasFilesDrag(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      try {
        const gathered = await gatherDropItems(event.dataTransfer);
        addFiles(gathered.flatMap((entry) => (entry.type === "folder" ? entry.files : [entry.file])));
      } catch { /* Ignore unreadable entries while preserving the rest. */ }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [globalTarget, sourceFormat]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => {
    controllerRef.current?.abort();
    itemsRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
  }, []);

  return (
    <>
    <div className="flex min-h-[100svh] shrink-0 flex-col">
    <ToolShell align="left">
      <GlassCard width={hasSvgWorkspace ? "max-w-[980px]" : hasFiles ? "max-w-[720px]" : "max-w-[400px]"} className="transition-[max-width] duration-300 ease-out">
        <motion.div layout className="mx-auto flex w-full max-w-[410px] items-center gap-[10px]" initial={{ opacity: 0, filter: "blur(8px)", y: -4 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
          <ConvertFormatPicker variant="hero" value={sourceFormat} options={inputOptions} onChange={applySource} allowAny label="From" placeholder="Any format" ariaLabel="Input format" className="min-w-0 flex-1" />
          <div className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center">
            <motion.span
              className="pointer-events-none absolute h-[46px] w-[46px] rounded-full bg-white/35"
              animate={{ scale: [0.72, 1, 0.72], opacity: [0, 0.62, 0] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.button
              type="button"
              onClick={swapFormats}
              animate={{ rotate: swapTurn * 180 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="relative z-10 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-border bg-white transition-colors hover:bg-white-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
              aria-label="Swap input and output formats"
            >
              <RefreshCw size={15} strokeWidth={1.45} absoluteStrokeWidth className="text-alt-text" />
            </motion.button>
          </div>
          <ConvertFormatPicker variant="hero" value={globalTarget} options={outputOptions} onChange={applyGlobalTarget} allowAny label="To" placeholder="Any format" ariaLabel="Output format for all files" availableLabel={selectedSourceLabel ? `Available from ${selectedSourceLabel}` : "Available conversions"} className="min-w-0 flex-1" />
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {!hasFiles ? (
            <motion.div key="empty" {...fade}>
              <Dropzone isDragging={isDragging} onOpen={openPicker} Icon={Plus} title="Add files" subtitle={sourceFormat === "any" ? "Choose files or drop folders here" : `Choose .${sourceFormat} files or drop folders here`} dragTitle="Drop files to convert" height="h-[158px]" />
            </motion.div>
          ) : (
            <motion.div key="filled" {...fade} className="flex flex-col gap-[7px]">
              <div className={cn("flex items-center justify-between rounded-[12px] border border-dashed border-border bg-bg p-[7px] pl-[10px] transition-all", isDragging && "border-text bg-bg-hover")}>
                <div className="flex items-center gap-[5px] text-[12px] text-alt-text">
                  <span>{items.length} file{items.length === 1 ? "" : "s"}</span>
                  <span className="h-[2.5px] w-[2.5px] rounded-full bg-border" />
                  <span>{formatBytes(totalBytes)}</span>
                </div>
                <GhostButton Icon={Plus} onClick={openPicker}>Add more</GhostButton>
              </div>

              <ScrollFadeList expanded={hasSvgWorkspace}>
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((item) => (
                    <motion.div key={item.id} {...rowMotion}>
                      <ConvertRow item={item} onRemove={removeItem} onRetarget={retarget} onSettings={updateSettings} onToggleSettings={(id) => setItems((previous) => previous.map((candidate) => candidate.id === id ? { ...candidate, settingsOpen: !candidate.settingsOpen } : candidate))} onCancel={cancelAll} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </ScrollFadeList>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-[6px]">
          <CtaButton label={allDone ? "Download all" : items.some((item) => item.status === "error") ? "Try failed again" : "Convert all"} busy={busy} busyLabel="Cancel conversion" onCancel={cancelAll} disabled={!hasFiles} onClick={allDone ? downloadIndividually : runAll} />
          <AnimatePresence initial={false}>
            {allDone && (
              <motion.button
                type="button"
                onClick={downloadZip}
                initial={{ opacity: 0, scale: 0.78, filter: "blur(6px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.78, filter: "blur(6px)" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white text-alt-text transition-colors hover:bg-white-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
                aria-label="Download everything as a ZIP"
                title="Download ZIP"
              >
                <FolderArchive size={17} strokeWidth={1.35} absoluteStrokeWidth />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>

      <input ref={inputRef} type="file" multiple hidden accept={acceptForFormat(sourceFormat)} onChange={onInputChange} />
    </ToolShell>
    </div>
    <SeoLandingContent page={seoPage} />
    </>
  );
}
