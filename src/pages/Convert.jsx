import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Download, Check, AlertCircle, X, Plus } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { GlassCard, CtaButton, GhostButton, Dropzone, FormatMenu, ProgressBar, StackIcon } from "@/components/ui";
import { Thumb } from "@/components/BeamUpload";
import { cn } from "@/lib/cn";
import { row as rowMotion, fade } from "@/lib/motion";
import { formatBytes, kindOf, gatherDropItems } from "@/lib/files";
import { zipSync, downloadBlob } from "@/lib/zip";
import { useSeo, toolJsonLd } from "@/lib/seo";
import { FORMATS, formatByValue, detectFormat, categoryOf, outputsFor, CONVERT_ACCEPT } from "@/lib/formats";
import { convertFile, needsEngine } from "@/lib/convert";

let uid = 0;

const ALL_OPTIONS = FORMATS.map((f) => ({ value: f.value, label: f.label }));

function defaultTargetFor(file, preferred) {
  const outs = outputsFor(categoryOf(file));
  if (preferred && outs.some((o) => o.value === preferred)) return preferred;
  const src = detectFormat(file)?.value;
  const pick = outs.find((o) => o.value !== src) || outs[0];
  return pick?.value || preferred;
}

function makeItem(file, preferred) {
  const kind = kindOf(file);
  const url = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
  return {
    id: ++uid,
    file,
    kind,
    url,
    target: defaultTargetFor(file, preferred),
    status: "idle", // idle | working | done | error
    progress: 0,
    statusText: "",
    result: null, // { blob, name }
    error: null,
  };
}

function SourceBadge({ file }) {
  const fmt = detectFormat(file);
  return (
    <span className="rounded-[6px] border border-border bg-white px-[6px] py-[1px] text-[11px] uppercase text-alt-text">
      {fmt ? fmt.label : (file.name.split(".").pop() || "file").toUpperCase()}
    </span>
  );
}

function ConvertRow({ item, onRemove, onRetarget }) {
  const options = useMemo(() => outputsFor(categoryOf(item.file)).map((o) => ({ value: o.value, label: o.label })), [item.file]);

  return (
    <div className="flex flex-col gap-[7px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px]">
      <div className="flex items-center gap-[8px]">
        <Thumb item={item} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-[14px] text-text">{item.file.name}</p>
          <p className="text-[11px] text-alt-text">{formatBytes(item.file.size)}</p>
        </div>

        {item.status === "done" ? (
          <button
            type="button"
            onClick={() => downloadBlob(item.result.name, item.result.blob)}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-text transition-all duration-150 hover:bg-text-hover"
            aria-label="Download"
          >
            <Download size={15} strokeWidth={1.5} absoluteStrokeWidth className="text-white" />
          </button>
        ) : item.status === "error" ? (
          <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center" title={item.error || "Failed"}>
            <AlertCircle size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-red-500" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="group flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] transition-all duration-150 hover:bg-bg-hover"
            aria-label="Remove"
          >
            <X size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text transition-colors group-hover:text-text" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-[8px] pl-[2px]">
        <SourceBadge file={item.file} />
        <RefreshCw size={13} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-dalt-text" />
        <div className="w-[104px]">
          <FormatMenu
            value={item.target}
            options={options}
            onChange={(v) => onRetarget(item.id, v)}
            disabled={item.status === "working" || item.status === "done"}
          />
        </div>
        <div className="min-w-0 flex-1">
          {item.status === "working" ? (
            <div className="flex flex-col gap-[3px]">
              <ProgressBar value={item.progress} />
              {item.statusText && <p className="truncate text-[10px] text-alt-text">{item.statusText}</p>}
            </div>
          ) : item.status === "done" ? (
            <div className="flex items-center gap-[4px] text-[11px] text-alt-text">
              <Check size={13} strokeWidth={2} absoluteStrokeWidth className="text-emerald-600" />
              {formatBytes(item.result.blob.size)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Convert() {
  const { pair } = useParams(); // e.g. "png-to-svg"
  const [from, to] = useMemo(() => {
    if (!pair) return [null, null];
    const m = pair.toLowerCase().split(/-to-|-2-|_to_/);
    return [formatByValue(m[0])?.value || null, formatByValue(m[1])?.value || null];
  }, [pair]);

  const [globalTarget, setGlobalTarget] = useState(to || "png");
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const hasFiles = items.length > 0;
  const allDone = hasFiles && items.every((it) => it.status === "done");
  const anyDone = items.some((it) => it.status === "done");

  const fromL = from ? formatByValue(from).label : null;
  const toL = to ? formatByValue(to).label : null;
  const seoTitle = fromL && toL ? `${fromL} to ${toL} converter` : "Free file converter";
  const seoDesc =
    fromL && toL
      ? `Convert ${fromL} to ${toL} online, free and instant. 100% in your browser — no uploads, no limits, unlimited files.`
      : "Convert images, audio and video between any format — free, instant, and 100% in your browser. No uploads, no limits.";
  const path = pair ? `/convert/${pair}` : "/convert";
  useSeo({ title: seoTitle, description: seoDesc, path, jsonLd: toolJsonLd({ name: seoTitle, description: seoDesc, path }) });

  const openPicker = () => inputRef.current?.click();

  const addFiles = (files) => {
    const next = Array.from(files).map((f) => makeItem(f, globalTarget));
    if (next.length) setItems((prev) => [...prev, ...next]);
  };

  const onInputChange = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeItem = (id) =>
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it?.url) URL.revokeObjectURL(it.url);
      return prev.filter((p) => p.id !== id);
    });

  const retarget = (id, v) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, target: v, status: "idle", result: null, error: null, progress: 0 } : it)));

  const applyGlobal = (v) => {
    setGlobalTarget(v);
    setItems((prev) =>
      prev.map((it) => {
        const outs = outputsFor(categoryOf(it.file));
        if (!outs.some((o) => o.value === v)) return it;
        return { ...it, target: v, status: "idle", result: null, error: null, progress: 0 };
      }),
    );
  };

  const patch = (id, data) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));

  const runAll = async () => {
    setBusy(true);
    for (const it of items) {
      if (it.status === "done") continue;
      patch(it.id, { status: "working", progress: 0, statusText: "" });
      try {
        const result = await convertFile(it.file, it.target, {
          onStatus: (t) => patch(it.id, { statusText: t }),
          onProgress: (p) => patch(it.id, { progress: p }),
        });
        patch(it.id, { status: "done", progress: 1, statusText: "", result });
      } catch (err) {
        patch(it.id, { status: "error", error: err?.message || "Conversion failed", statusText: "" });
      }
    }
    setBusy(false);
  };

  const downloadAll = () => {
    const done = items.filter((it) => it.status === "done" && it.result);
    if (done.length === 0) return;
    if (done.length === 1) return downloadBlob(done[0].result.name, done[0].result.blob);
    Promise.all(done.map(async (it) => ({ name: it.result.name, bytes: new Uint8Array(await it.result.blob.arrayBuffer()) }))).then((entries) => {
      const seen = {};
      for (const e of entries) {
        if (seen[e.name] != null) {
          seen[e.name] += 1;
          e.name = e.name.replace(/(\.[^.]+)$/, `-${seen[e.name]}$1`);
        } else seen[e.name] = 0;
      }
      downloadBlob("filzy-converted.zip", zipSync(entries));
    });
  };

  const reset = () => {
    items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
    setItems([]);
  };

  useEffect(() => {
    const hasFilesDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const onEnter = (e) => {
      if (!hasFilesDrag(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };
    const onOver = (e) => hasFilesDrag(e) && e.preventDefault();
    const onLeave = (e) => {
      if (!hasFilesDrag(e)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    };
    const onDrop = async (e) => {
      if (!hasFilesDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      try {
        const gathered = await gatherDropItems(e.dataTransfer);
        const files = gathered.flatMap((g) => (g.type === "folder" ? g.files : [g.file]));
        addFiles(files);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [globalTarget]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url)), []);

  const ctaLabel = allDone ? "Download all" : "Convert all";

  return (
    <ToolShell>
      <GlassCard width="max-w-[420px]">
        <div className="flex flex-col gap-[6px] px-[4px] pt-[4px]">
          <div className="flex items-center gap-[8px]">
            <StackIcon Icon={RefreshCw} />
            <div className="flex flex-col">
              <h1 className="font-casser text-[19px] text-text">{fromL && toL ? `${fromL} → ${toL}` : "Convert anything"}</h1>
              <p className="text-[12px] text-alt-text">Any format, in your browser. Free & unlimited.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-[8px] rounded-[12px] border border-border bg-bg p-[8px]">
          <span className="shrink-0 pl-[2px] text-[13px] text-alt-text">Convert to</span>
          <FormatMenu value={globalTarget} options={ALL_OPTIONS} onChange={applyGlobal} placeholder="Format" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!hasFiles ? (
            <motion.div key="empty" {...fade}>
              <Dropzone isDragging={isDragging} onOpen={openPicker} Icon={Plus} title="Add files" subtitle="Drop anything — images, audio, video" />
            </motion.div>
          ) : (
            <motion.div key="filled" {...fade} className="flex flex-col gap-[8px]">
              <div
                className={cn(
                  "flex items-center justify-between rounded-[12px] border border-dashed border-border bg-bg p-[8px] pl-[12px] transition-all duration-150",
                  isDragging && "border-text bg-bg-hover",
                )}
              >
                <p className="text-[14px] text-alt-text">
                  {items.length} file{items.length === 1 ? "" : "s"}
                </p>
                <GhostButton Icon={Plus} onClick={openPicker}>
                  Add more
                </GhostButton>
              </div>

              <div className="flex max-h-[320px] flex-col gap-[6px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((it) => (
                    <motion.div key={it.id} {...rowMotion}>
                      <ConvertRow item={it} onRemove={removeItem} onRetarget={retarget} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-[6px]">
          <CtaButton label={ctaLabel} busy={busy} disabled={!hasFiles} onClick={allDone ? downloadAll : runAll} />
          {hasFiles && (
            <div className="flex items-center justify-between px-[2px]">
              <button onClick={reset} className="cursor-pointer text-[12px] text-alt-text transition-colors hover:text-text">
                Clear all
              </button>
              {anyDone && !allDone && (
                <button onClick={downloadAll} className="cursor-pointer text-[12px] text-alt-text transition-colors hover:text-text">
                  Download ready ({items.filter((i) => i.status === "done").length})
                </button>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      <input ref={inputRef} type="file" multiple hidden accept={CONVERT_ACCEPT} onChange={onInputChange} />
    </ToolShell>
  );
}
