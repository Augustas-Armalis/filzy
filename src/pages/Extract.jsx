import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X, Plus, Link2, Loader, Info } from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { GlassCard, CtaButton, Segmented, FormatMenu, ProgressBar, StackIcon } from "@/components/ui";
import { row as rowMotion, fade } from "@/lib/motion";
import { downloadBlob } from "@/lib/zip";
import { useSeo, toolJsonLd } from "@/lib/seo";
import { detectPlatform, requestExtraction, FORMAT_OPTS, QUALITY_OPTS, EXTRACT_API } from "@/lib/extract";

let uid = 0;

// Colored platform avatar: YouTube shows the video thumbnail; others a brand
// initial on their brand color.
function PlatformAvatar({ info }) {
  if (info?.thumbnail) {
    return <img src={info.thumbnail} alt="" className="h-[42px] w-[42px] shrink-0 rounded-[7px] border border-white/20 object-cover" />;
  }
  return (
    <div
      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[7px] border border-white/20"
      style={{ backgroundColor: info?.color || "#6F747B" }}
    >
      <span className="text-[16px] font-semibold text-white">{(info?.label || "?").charAt(0)}</span>
    </div>
  );
}

function LinkRow({ item, onRemove }) {
  return (
    <div className="flex items-center gap-[8px] rounded-[12px] border border-border bg-white p-[6px] pr-[8px]">
      <PlatformAvatar info={item.info} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[13px] text-text">{item.info?.label || "Link"}</p>
        <p className="truncate text-[11px] text-alt-text">{item.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
        {item.status === "working" && (
          <div className="mt-[4px]">
            <ProgressBar value={item.progress} />
          </div>
        )}
        {item.status === "error" && <p className="mt-[1px] truncate text-[11px] text-amber-600">{item.message}</p>}
      </div>

      {item.status === "working" ? (
        <Loader size={16} strokeWidth={1.6} absoluteStrokeWidth className="mr-[4px] shrink-0 animate-spin text-alt-text" />
      ) : item.status === "done" ? (
        <button
          type="button"
          onClick={() => (item.result?.blob ? downloadBlob(item.result.filename, item.result.blob) : window.open(item.result.url, "_blank"))}
          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-text transition-all hover:bg-text-hover"
          aria-label="Download"
        >
          <Download size={15} strokeWidth={1.5} absoluteStrokeWidth className="text-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="group flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] transition-all hover:bg-bg-hover"
          aria-label="Remove"
        >
          <X size={14} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text transition-colors group-hover:text-text" />
        </button>
      )}
    </div>
  );
}

export default function Extract() {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState([]);
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("best");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useSeo({
    title: "Extract & download media",
    description: "Download video & audio from YouTube, TikTok, Instagram and more — pick MP4 or MP3 and full quality. Paste a link and go.",
    path: "/extract",
    jsonLd: toolJsonLd({ name: "Media extractor", description: "Download video/audio from social platforms in your chosen format & quality.", path: "/extract" }),
  });

  const detected = useMemo(() => detectPlatform(draft), [draft]);
  const canAdd = !!detected;
  const hasLinks = items.length > 0;
  const allDone = hasLinks && items.every((it) => it.status === "done");

  const qualityOptions = QUALITY_OPTS[format] || [];
  // keep quality valid when format flips
  if (qualityOptions.length && !qualityOptions.some((q) => q.value === quality)) {
    setQuality(qualityOptions[0].value);
  }

  const addLink = (value) => {
    const info = detectPlatform(value);
    if (!info) return;
    setItems((prev) => [...prev, { id: ++uid, url: info.url, info, status: "idle", progress: 0, message: "", result: null }]);
    setDraft("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && canAdd) {
      e.preventDefault();
      addLink(draft);
    }
  };

  const removeItem = (id) => setItems((prev) => prev.filter((p) => p.id !== id));
  const patch = (id, data) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data } : it)));

  const runAll = async () => {
    setBusy(true);
    for (const it of items) {
      if (it.status === "done") continue;
      patch(it.id, { status: "working", progress: 0.25, message: "" });
      const res = await requestExtraction({ url: it.url, format, quality });
      if (res.ok) {
        patch(it.id, { status: "done", progress: 1, result: res });
      } else {
        patch(it.id, {
          status: "error",
          progress: 0,
          message: res.reason === "backend" ? "Queued — backend connecting soon" : res.message,
        });
      }
    }
    setBusy(false);
  };

  return (
    <ToolShell>
      <GlassCard width="max-w-[420px]">
        <div className="flex items-center gap-[8px] px-[4px] pt-[4px]">
          <StackIcon Icon={Download} />
          <div className="flex flex-col">
            <h1 className="font-casser text-[19px] text-text">Extract media</h1>
            <p className="text-[12px] text-alt-text">Paste a link. Pick a format. Done.</p>
          </div>
        </div>

        {/* Link input with live detection */}
        <div className="flex items-center gap-[7px] rounded-[12px] border border-border bg-white p-[6px] pl-[10px]">
          <Link2 size={15} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-alt-text" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste a YouTube, TikTok, IG… link"
            className="h-[26px] w-full bg-transparent text-[14px] text-text outline-none placeholder:text-dalt-text"
          />
          {canAdd && (
            <button
              type="button"
              onClick={() => addLink(draft)}
              className="flex h-[28px] shrink-0 items-center gap-[4px] rounded-[8px] bg-text pl-[7px] pr-[9px] transition-all hover:bg-text-hover"
            >
              <Plus size={14} strokeWidth={1.6} absoluteStrokeWidth className="text-white" />
              <span className="text-[13px] text-white">Add</span>
            </button>
          )}
        </div>

        {/* live-detected platform hint */}
        <AnimatePresence>
          {draft && detected && (
            <motion.p {...fade} className="-mt-[2px] flex items-center gap-[5px] px-[4px] text-[12px] text-alt-text">
              <span className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: detected.color }} />
              Detected <span className="text-text">{detected.label}</span> — press Enter to add
            </motion.p>
          )}
        </AnimatePresence>

        {/* Format + quality */}
        <div className="flex flex-col gap-[8px] rounded-[12px] border border-border bg-bg p-[8px]">
          <Segmented options={FORMAT_OPTS.map((f) => ({ id: f.value, label: f.label }))} value={format} onChange={setFormat} />
          <div className="flex items-center gap-[8px]">
            <span className="shrink-0 pl-[2px] text-[13px] text-alt-text">Quality</span>
            <FormatMenu value={quality} options={qualityOptions} onChange={setQuality} />
          </div>
        </div>

        {/* Link list */}
        <AnimatePresence mode="wait" initial={false}>
          {hasLinks && (
            <motion.div key="list" {...fade} className="flex max-h-[280px] flex-col gap-[6px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((it) => (
                  <motion.div key={it.id} {...rowMotion}>
                    <LinkRow item={it} onRemove={removeItem} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* honest backend note */}
        {!EXTRACT_API && (
          <div className="flex items-start gap-[7px] rounded-[10px] border border-border bg-bg px-[10px] py-[8px]">
            <Info size={14} strokeWidth={1.5} absoluteStrokeWidth className="mt-[1px] shrink-0 text-alt-text" />
            <p className="text-[11px] leading-snug text-alt-text">
              Downloading needs Filzy's extraction service (coming soon). You can queue links now — the picker & detection already work.
            </p>
          </div>
        )}

        <CtaButton label={allDone ? "Done" : "Extract all"} busy={busy} disabled={!hasLinks} onClick={runAll} />
      </GlassCard>
    </ToolShell>
  );
}
