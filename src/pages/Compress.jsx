import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minimize2, Download, Check, AlertCircle, X, Plus, Settings2 } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { GlassCard, CtaButton, GhostButton, Dropzone, Segmented, ProgressBar, StackIcon } from "@/components/ui";
import { Thumb } from "@/components/BeamUpload";
import { cn } from "@/lib/cn";
import { row as rowMotion, fade } from "@/lib/motion";
import { formatBytes, gatherDropItems } from "@/lib/files";
import { zipSync, downloadBlob } from "@/lib/zip";
import { useSeo, toolJsonLd } from "@/lib/seo";
import { PRESETS, compressVideo } from "@/lib/compress";

let uid = 0;

const SCALE_OPTS = [
  { id: 0, label: "Auto" },
  { id: 1080, label: "1080p" },
  { id: 720, label: "720p" },
  { id: 480, label: "480p" },
];

function makeItem(file) {
  return {
    id: ++uid,
    file,
    kind: "video",
    url: URL.createObjectURL(file),
    status: "idle", // idle | working | done | error
    progress: 0,
    statusText: "",
    result: null,
    error: null,
  };
}

function CompressRow({ item, onRemove, targetBytes }) {
  const underTarget = item.result && targetBytes && item.result.blob.size <= targetBytes * 1.02;
  return (
    <div className="flex flex-col gap-[7px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px]">
      <div className="flex items-center gap-[8px]">
        <Thumb item={item} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-[14px] text-text">{item.file.name}</p>
          <div className="flex items-center gap-[5px] text-[11px] text-alt-text">
            <span>{formatBytes(item.file.size)}</span>
            {item.status === "done" && (
              <>
                <span className="text-dalt-text">→</span>
                <span className={cn(underTarget ? "text-emerald-600" : "text-text")}>{formatBytes(item.result.blob.size)}</span>
                <span className="text-dalt-text">(−{Math.max(0, Math.round((1 - item.result.blob.size / item.file.size) * 100))}%)</span>
              </>
            )}
          </div>
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

      {item.status === "working" && (
        <div className="flex flex-col gap-[3px] pl-[2px]">
          <ProgressBar value={item.progress} />
          {item.statusText && <p className="truncate text-[10px] text-alt-text">{item.statusText}</p>}
        </div>
      )}
      {item.status === "done" && (
        <div className="flex items-center gap-[4px] pl-[2px] text-[11px] text-alt-text">
          <Check size={13} strokeWidth={2} absoluteStrokeWidth className="text-emerald-600" /> Compressed
        </div>
      )}
    </div>
  );
}

export default function Compress() {
  const [presetId, setPresetId] = useState("discord");
  const [mode, setMode] = useState("size"); // size | percent (used when Custom)
  const [mb, setMb] = useState(8);
  const [percent, setPercent] = useState(50);
  const [scale, setScale] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const isCustom = presetId === "custom";
  const preset = PRESETS.find((p) => p.id === presetId);
  const targetMb = isCustom ? mb : preset?.mb;
  const targetBytes = mode === "percent" && isCustom ? null : (targetMb || 0) * 1024 * 1024;

  useSeo({
    title: "Compress video",
    description: "Compress video online free — hit Discord, email or WhatsApp size limits, or a custom MB / %. 100% in your browser, no uploads.",
    path: "/compress",
    jsonLd: toolJsonLd({ name: "Video compressor", description: "Compress video to a target size in your browser, free.", path: "/compress" }),
  });

  const hasFiles = items.length > 0;
  const allDone = hasFiles && items.every((it) => it.status === "done");
  const anyDone = items.some((it) => it.status === "done");

  const openPicker = () => inputRef.current?.click();

  const addFiles = (files) => {
    const vids = Array.from(files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm|avi|m4v|3gp)$/i.test(f.name));
    const next = vids.map(makeItem);
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

  const patch = (id, data) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));

  const runAll = async () => {
    setBusy(true);
    for (const it of items) {
      if (it.status === "done") continue;
      patch(it.id, { status: "working", progress: 0, statusText: "" });
      try {
        const result = await compressVideo(it.file, {
          mode: isCustom ? mode : "size",
          mb: targetMb,
          percent,
          scale,
          onStatus: (t) => patch(it.id, { statusText: t }),
          onProgress: (p) => patch(it.id, { progress: p }),
        });
        patch(it.id, { status: "done", progress: 1, statusText: "", result });
      } catch (err) {
        patch(it.id, { status: "error", error: err?.message || "Compression failed", statusText: "" });
      }
    }
    setBusy(false);
  };

  const downloadAll = () => {
    const done = items.filter((it) => it.status === "done" && it.result);
    if (done.length === 0) return;
    if (done.length === 1) return downloadBlob(done[0].result.name, done[0].result.blob);
    Promise.all(done.map(async (it) => ({ name: it.result.name, bytes: new Uint8Array(await it.result.blob.arrayBuffer()) }))).then((entries) =>
      downloadBlob("filzy-compressed.zip", zipSync(entries)),
    );
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
        addFiles(gathered.flatMap((g) => (g.type === "folder" ? g.files : [g.file])));
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
  }, []);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url)), []);

  const chips = [...PRESETS, { id: "custom", label: "Custom" }];

  return (
    <ToolShell>
      <GlassCard width="max-w-[420px]">
        <div className="flex items-center gap-[8px] px-[4px] pt-[4px]">
          <StackIcon Icon={Minimize2} />
          <div className="flex flex-col">
            <h1 className="font-casser text-[19px] text-text">Compress video</h1>
            <p className="text-[12px] text-alt-text">Fit any limit. Free, in your browser.</p>
          </div>
        </div>

        {/* Preset chips */}
        <div className="flex flex-col gap-[8px] rounded-[12px] border border-border bg-bg p-[8px]">
          <div className="grid grid-cols-3 gap-[4px]">
            {chips.map((c) => {
              const active = presetId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPresetId(c.id)}
                  className={cn(
                    "flex h-[30px] items-center justify-center rounded-[8px] border text-[13px] transition-all duration-150",
                    active ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-white-hover",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {!isCustom ? (
            <p className="px-[2px] text-[12px] text-alt-text">
              Target <span className="text-text">{preset.mb} MB</span> · {preset.sub}
            </p>
          ) : (
            <div className="flex flex-col gap-[8px]">
              <Segmented
                options={[
                  { id: "size", label: "Target MB" },
                  { id: "percent", label: "Percentage" },
                ]}
                value={mode}
                onChange={setMode}
              />
              {mode === "size" ? (
                <div className="flex items-center gap-[8px] rounded-[10px] border border-border bg-white px-[10px]">
                  <input
                    type="number"
                    min={1}
                    value={mb}
                    onChange={(e) => setMb(Math.max(1, Number(e.target.value) || 1))}
                    className="h-[36px] w-full bg-transparent text-[14px] text-text outline-none"
                  />
                  <span className="shrink-0 text-[13px] text-alt-text">MB</span>
                </div>
              ) : (
                <div className="flex flex-col gap-[4px]">
                  <div className="flex items-center justify-between px-[2px] text-[12px] text-alt-text">
                    <span>Of original size</span>
                    <span className="text-text">{percent}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    step={5}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    className="h-[6px] w-full cursor-pointer appearance-none rounded-full bg-border accent-[#050505]"
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-[6px] px-[2px] text-[12px] text-alt-text transition-colors hover:text-text"
          >
            <Settings2 size={13} strokeWidth={1.5} absoluteStrokeWidth />
            {showAdvanced ? "Hide" : "Advanced"} · resolution
          </button>
          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Segmented options={SCALE_OPTS} value={scale} onChange={setScale} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!hasFiles ? (
            <motion.div key="empty" {...fade}>
              <Dropzone isDragging={isDragging} onOpen={openPicker} Icon={Plus} title="Add videos" subtitle="MP4, MOV, MKV, WEBM, AVI…" />
            </motion.div>
          ) : (
            <motion.div key="filled" {...fade} className="flex flex-col gap-[8px]">
              <div className={cn("flex items-center justify-between rounded-[12px] border border-dashed border-border bg-bg p-[8px] pl-[12px]", isDragging && "border-text bg-bg-hover")}>
                <p className="text-[14px] text-alt-text">
                  {items.length} video{items.length === 1 ? "" : "s"}
                </p>
                <GhostButton Icon={Plus} onClick={openPicker}>
                  Add more
                </GhostButton>
              </div>
              <div className="flex max-h-[300px] flex-col gap-[6px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((it) => (
                    <motion.div key={it.id} {...rowMotion}>
                      <CompressRow item={it} onRemove={removeItem} targetBytes={targetBytes} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-[6px]">
          <CtaButton label={allDone ? "Download all" : "Compress"} busy={busy} disabled={!hasFiles} onClick={allDone ? downloadAll : runAll} />
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

      <input ref={inputRef} type="file" multiple hidden accept="video/*" onChange={onInputChange} />
    </ToolShell>
  );
}
