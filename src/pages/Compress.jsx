import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Download, FolderArchive, Gauge, Plus, Settings2, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { ToolShell } from "@/components/ToolShell";
import { SeoLandingContent } from "@/components/SeoContent";
import { CtaButton, Dropzone, FormatMenu, GhostButton, GlassCard, ProgressBar, Segmented } from "@/components/ui";
import { splitName, Thumb } from "@/components/BeamUpload";
import { cn } from "@/lib/cn";
import { seoPageForPath } from "@/content/seoCatalog";
import { fade, row as rowMotion } from "@/lib/motion";
import { formatBytes, gatherDropItems, kindOf } from "@/lib/files";
import { downloadBlob, zipSync } from "@/lib/zip";
import { pageJsonLd, toolJsonLd, useSeo } from "@/lib/seo";
import { categoryOf } from "@/lib/formats";
import {
  COMPRESS_ACCEPT,
  compressMedia,
  defaultCompressionSettings,
  estimateCompressedBytes,
  isCompressibleMedia,
  probeMedia,
} from "@/lib/compress";

let uid = 0;
const STORAGE_KEY = "filzy:compress-target:v2";
const TARGET_PRESETS = [
  { id: "discord", label: "10 MB", mb: 10 },
  { id: "email", label: "25 MB", mb: 25 },
];

const QUALITY_OPTIONS = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "best", label: "Best" },
];

const RESOLUTION_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "original", label: "Original" },
  { value: "2160", label: "4K" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
];

const FPS_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "original", label: "Original" },
  { value: "60", label: "60 fps" },
  { value: "30", label: "30 fps" },
  { value: "24", label: "24 fps" },
];

const IMAGE_FORMAT_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "same", label: "Keep format" },
  { value: "webp", label: "WEBP" },
  { value: "jpg", label: "JPG" },
  { value: "avif", label: "AVIF" },
  { value: "png", label: "PNG" },
];

const IMAGE_DIMENSION_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "original", label: "Original" },
  { value: "3840", label: "4K max" },
  { value: "2560", label: "2K max" },
  { value: "1920", label: "1080p max" },
  { value: "1280", label: "720p max" },
];

const IMAGE_QUALITY_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "95", label: "95%" },
  { value: "85", label: "85%" },
  { value: "75", label: "75%" },
  { value: "60", label: "60%" },
];

const AUDIO_FORMAT_OPTIONS = [
  { value: "mp3", label: "MP3" },
  { value: "aac", label: "AAC" },
  { value: "opus", label: "OPUS" },
];

const AUDIO_BITRATE_OPTIONS = [
  { value: "auto", label: "Smart" },
  { value: "320", label: "320 kbps" },
  { value: "256", label: "256 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "128", label: "128 kbps" },
  { value: "96", label: "96 kbps" },
  { value: "64", label: "64 kbps" },
];

const SAMPLE_RATE_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "48000", label: "48 kHz" },
  { value: "44100", label: "44.1 kHz" },
  { value: "32000", label: "32 kHz" },
  { value: "22050", label: "22.05 kHz" },
];

const CHANNEL_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "stereo", label: "Stereo" },
  { value: "mono", label: "Mono" },
];

function normalizeTarget(value, fallback = 10) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(0.1, parsed) : fallback;
}

function loadSavedTarget() {
  if (typeof window === "undefined") return 10;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeTarget(saved.mb, 10);
  } catch {
    return 10;
  }
}

function automaticSettings(settings) {
  return {
    ...settings,
    videoResolution: "auto",
    videoFps: "auto",
    videoBitrate: "auto",
    imageFormat: "auto",
    imageDimension: "auto",
    imageQuality: "auto",
    audioBitrate: "auto",
  };
}

function halfTarget(file) {
  const mb = file.size / 2 / 1024 / 1024;
  return Math.max(0.1, Number(mb.toFixed(mb < 10 ? 1 : 0)));
}

function targetLabel(value) {
  const mb = normalizeTarget(value);
  if (mb < 1) return Math.round(mb * 1000) + " KB";
  return Number(mb.toFixed(mb < 10 ? 1 : 0)) + " MB";
}

function categoryLabel(category) {
  if (category === "video") return "Video";
  if (category === "image") return "Image";
  if (category === "audio") return "Audio";
  return "Media";
}

function makeItem(file, targetMb, targetPercent) {
  const kind = kindOf(file);
  const routeTarget = targetPercent
    ? Math.max(0.1, Number((file.size * targetPercent / 100 / 1024 / 1024).toFixed(1)))
    : normalizeTarget(targetMb);
  return {
    id: ++uid,
    file,
    kind,
    category: categoryOf(file),
    url: kind === "image" || kind === "video" ? URL.createObjectURL(file) : null,
    meta: null,
    targetMb: routeTarget,
    settings: defaultCompressionSettings(),
    smartTarget: true,
    settingsOpen: false,
    status: "idle",
    progress: 0,
    statusText: "",
    result: null,
    error: null,
  };
}

function TargetSizeField({ value, onChange, onBlur, label = "Target size", showIcon = false }) {
  return (
    <label className="flex h-[46px] min-w-0 cursor-text items-center gap-[8px] rounded-[10px] border border-border bg-white px-[10px] transition-[border-color,box-shadow] focus-within:border-alt-text focus-within:ring-2 focus-within:ring-text/10">
      {showIcon && (
        <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px] border border-border bg-bg">
          <Gauge size={15} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] leading-[12px] text-alt-text">{label}</span>
        <input
          aria-label={label}
          name="compression-target"
          type="number"
          min="0.1"
          step="0.1"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className="number-input-no-spinner block w-full min-w-0 bg-transparent text-[16px] leading-[20px] tabular-nums text-text outline-none"
        />
      </span>
      <span className="shrink-0 text-[11px] text-alt-text">MB</span>
    </label>
  );
}

function SettingField({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-[4px]">
      <span className="px-[2px] text-[10px] leading-[13px] text-alt-text">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ active, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={cn(
        "flex h-[36px] w-full cursor-pointer touch-manipulation items-center justify-between rounded-[9px] border px-[9px] text-[12px] transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
        active ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-white-hover hover:text-text",
      )}
    >
      <span>{label}</span>
      <span className={cn("relative h-[18px] w-[30px] rounded-full transition-colors", active ? "bg-white/25" : "bg-border")}>
        <span className={cn("absolute top-[3px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform", active ? "translate-x-[15px]" : "translate-x-[3px]")} />
      </span>
    </button>
  );
}

function FileSettings({ item, estimate, onTargetChange, onTargetCommit, onPreset, onPatch }) {
  const settings = item.settings;
  const estimatedLabel = "Estimated " + formatBytes(estimate);
  const half = halfTarget(item.file);

  return (
    <div className="border-t border-border bg-bg/75 p-[7px]">
      <div className="grid gap-[5px] sm:grid-cols-[minmax(140px,1fr)_minmax(240px,auto)]">
        <TargetSizeField
          value={item.smartTarget ? item.targetMb : Number((estimate / 1024 / 1024).toFixed(estimate < 10 * 1024 * 1024 ? 1 : 0))}
          label={item.smartTarget ? "Target size" : estimatedLabel}
          onChange={onTargetChange}
          onBlur={onTargetCommit}
        />
        <div className="grid grid-cols-3 gap-[3px] rounded-[10px] border border-border bg-bg p-[3px]">
          {TARGET_PRESETS.map((preset) => {
            const active = item.smartTarget && Math.abs(normalizeTarget(item.targetMb) - preset.mb) < 0.01;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPreset(preset.mb)}
                className={cn(
                  "flex h-[38px] cursor-pointer touch-manipulation items-center justify-center rounded-[7px] px-[7px] text-[11px] transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
                  active ? "bg-white text-text shadow-sm" : "text-alt-text hover:text-text",
                )}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPreset(half)}
            className={cn(
              "flex h-[38px] cursor-pointer touch-manipulation items-center justify-center rounded-[7px] px-[7px] text-[11px] transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
              item.smartTarget && Math.abs(normalizeTarget(item.targetMb) - half) < 0.05 ? "bg-white text-text shadow-sm" : "text-alt-text hover:text-text",
            )}
          >
            Half size
          </button>
        </div>
      </div>

      <div className="mt-[7px] grid gap-x-[6px] gap-y-[7px] sm:grid-cols-2">
        {item.category === "video" && (
          <>
            <SettingField label="Encoding quality">
              <Segmented options={QUALITY_OPTIONS} value={settings.videoQuality} onChange={(videoQuality) => onPatch({ videoQuality })} />
            </SettingField>
            <SettingField label="Resolution">
              <FormatMenu ariaLabel="Video resolution" value={String(settings.videoResolution)} options={RESOLUTION_OPTIONS} onChange={(videoResolution) => onPatch({ videoResolution })} />
            </SettingField>
            <SettingField label="Frame rate">
              <FormatMenu ariaLabel="Video frame rate" value={String(settings.videoFps)} options={FPS_OPTIONS} onChange={(videoFps) => onPatch({ videoFps })} />
            </SettingField>
            <SettingField label="Video bitrate">
              <label className="flex h-[36px] items-center gap-[6px] rounded-[9px] border border-border bg-white px-[9px] transition-[border-color,box-shadow] focus-within:border-alt-text focus-within:ring-2 focus-within:ring-text/10">
                <input
                  aria-label="Video bitrate"
                  name={"video-bitrate-" + item.id}
                  type="number"
                  min="120"
                  inputMode="numeric"
                  autoComplete="off"
                  value={settings.videoBitrate === "auto" ? "" : settings.videoBitrate}
                  onChange={(event) => onPatch({ videoBitrate: event.target.value ? Number(event.target.value) : "auto" })}
                  placeholder="Smart"
                  className="number-input-no-spinner min-w-0 flex-1 bg-transparent text-[12px] tabular-nums text-text outline-none placeholder:text-dalt-text"
                />
                <span className="text-[10px] text-alt-text">kbps</span>
              </label>
            </SettingField>
            <SettingField label="Audio track">
              <Toggle active={settings.keepAudio} onChange={(keepAudio) => onPatch({ keepAudio })} label={settings.keepAudio ? "Keep audio" : "Remove audio"} />
            </SettingField>
            <SettingField label="Audio quality">
              <FormatMenu
                ariaLabel="Video audio quality"
                disabled={!settings.keepAudio}
                value={String(settings.videoAudioBitrate)}
                options={AUDIO_BITRATE_OPTIONS.filter(({ value }) => value !== "auto")}
                onChange={(videoAudioBitrate) => onPatch({ videoAudioBitrate: Number(videoAudioBitrate) })}
              />
            </SettingField>
          </>
        )}

        {item.category === "image" && (
          <>
            <SettingField label="Output format">
              <FormatMenu ariaLabel="Compressed image format" value={settings.imageFormat} options={IMAGE_FORMAT_OPTIONS} onChange={(imageFormat) => onPatch({ imageFormat })} />
            </SettingField>
            <SettingField label="Maximum dimensions">
              <FormatMenu ariaLabel="Maximum image dimensions" value={String(settings.imageDimension)} options={IMAGE_DIMENSION_OPTIONS} onChange={(imageDimension) => onPatch({ imageDimension })} />
            </SettingField>
            <SettingField label="Image quality">
              <FormatMenu ariaLabel="Image quality" value={String(settings.imageQuality)} options={IMAGE_QUALITY_OPTIONS} onChange={(imageQuality) => onPatch({ imageQuality })} />
            </SettingField>
          </>
        )}

        {item.category === "audio" && (
          <>
            <SettingField label="Output format">
              <FormatMenu ariaLabel="Compressed audio format" value={settings.audioFormat} options={AUDIO_FORMAT_OPTIONS} onChange={(audioFormat) => onPatch({ audioFormat })} />
            </SettingField>
            <SettingField label="Audio bitrate">
              <FormatMenu ariaLabel="Audio bitrate" value={String(settings.audioBitrate)} options={AUDIO_BITRATE_OPTIONS} onChange={(audioBitrate) => onPatch({ audioBitrate })} />
            </SettingField>
            <SettingField label="Sample rate">
              <FormatMenu ariaLabel="Audio sample rate" value={String(settings.audioSampleRate)} options={SAMPLE_RATE_OPTIONS} onChange={(audioSampleRate) => onPatch({ audioSampleRate })} />
            </SettingField>
            <SettingField label="Channels">
              <FormatMenu ariaLabel="Audio channels" value={settings.audioChannels} options={CHANNEL_OPTIONS} onChange={(audioChannels) => onPatch({ audioChannels })} />
            </SettingField>
          </>
        )}
      </div>
    </div>
  );
}

function ScrollFadeList({ children }) {
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
    ? "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)"
    : fadeTop
      ? "linear-gradient(to bottom, transparent 0, black 20px, black 100%)"
      : fadeBottom
        ? "linear-gradient(to bottom, black 0, black calc(100% - 20px), transparent 100%)"
        : undefined;

  return (
    <div
      ref={ref}
      className="flex max-h-[430px] flex-col gap-[4px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  );
}

function CompressRow({
  item,
  estimate,
  onRemove,
  onCancel,
  onToggleSettings,
  onTargetChange,
  onTargetCommit,
  onPreset,
  onPatchSettings,
}) {
  const [head, tail] = splitName(item.file.name);
  const working = item.status === "working";
  const done = item.status === "done";
  const saved = done ? Math.max(0, Math.round((1 - item.result.blob.size / item.file.size) * 100)) : 0;

  return (
    <div className={cn("overflow-hidden rounded-[12px] border bg-white transition-colors", item.status === "error" ? "border-red-200" : done ? "border-green-200" : "border-border")}>
      <div className="flex items-center gap-[7px] p-[6px]">
        <Thumb item={item} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 text-[13px] leading-[18px] text-text">
            <span className="truncate">{head}</span>
            {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
          </div>
          <div className="flex min-w-0 items-center gap-[5px] text-[10px] leading-[14px] text-alt-text">
            <span>{categoryLabel(item.category)}</span>
            <span className="h-[2px] w-[2px] rounded-full bg-border" />
            <span>{formatBytes(item.file.size)}</span>
            {!done && (
              <>
                <span className="text-dalt-text">→</span>
                <span>≈ {formatBytes(estimate)}</span>
              </>
            )}
            {done && (
              <>
                <span className="text-dalt-text">→</span>
                <span className={item.result.blob.size <= item.file.size ? "text-green-600" : "text-text"}>{formatBytes(item.result.blob.size)}</span>
              </>
            )}
          </div>
        </div>

        {!working && !done && (
          <>
            <span className="hidden h-[34px] shrink-0 items-center rounded-[9px] bg-bg px-[8px] text-[10px] tabular-nums text-alt-text sm:flex">
              {item.smartTarget ? targetLabel(item.targetMb) : "≈ " + formatBytes(estimate)}
            </span>
            <button
              type="button"
              onClick={onToggleSettings}
              aria-label={(item.settingsOpen ? "Hide" : "Show") + " compression settings for " + item.file.name}
              aria-expanded={item.settingsOpen}
              className={cn(
                "flex h-[34px] w-[34px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[9px] border transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
                item.settingsOpen ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-white-hover hover:text-text",
              )}
            >
              <Settings2 size={14} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />
            </button>
          </>
        )}
        {done && (
          <button
            type="button"
            onClick={() => downloadBlob(item.result.name, item.result.blob)}
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[9px] bg-text text-white transition-colors hover:bg-text-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
            aria-label={"Download " + item.result.name}
          >
            <Download size={15} strokeWidth={1.4} absoluteStrokeWidth aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={working ? onCancel : () => onRemove(item.id)}
          className="group flex h-[34px] w-[34px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[9px] transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
          aria-label={working ? "Cancel compression" : "Remove " + item.file.name}
        >
          <X size={14} strokeWidth={1.17} absoluteStrokeWidth className={working ? "text-red-500" : "text-alt-text group-hover:text-text"} aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {item.settingsOpen && !working && !done && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, height: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
            exit={{ opacity: 0, height: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <FileSettings
              item={item}
              estimate={estimate}
              onTargetChange={onTargetChange}
              onTargetCommit={onTargetCommit}
              onPreset={onPreset}
              onPatch={onPatchSettings}
            />
          </motion.div>
        )}
        {working && (
          <motion.div key="working" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-[8px] border-t border-border/80 px-[8px] py-[7px]">
              <ProgressBar value={item.progress} className="flex-1" />
              <span aria-live="polite" className="w-[118px] truncate text-right text-[10px] tabular-nums text-alt-text">{item.statusText || Math.round(item.progress * 100) + "%"}</span>
            </div>
          </motion.div>
        )}
        {done && (
          <motion.div key="done" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center justify-between border-t border-green-100 bg-green-50/40 px-[8px] py-[7px] text-[10px] text-alt-text">
              <span className="flex items-center gap-[5px]"><Check size={12} strokeWidth={2} className="text-green-600" aria-hidden="true" />{item.result.unchanged ? "Already within target" : "Compressed"}</span>
              <span>{saved > 0 ? saved + "% smaller" : "Original kept"}</span>
            </div>
          </motion.div>
        )}
        {item.status === "error" && (
          <motion.div key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-[6px] border-t border-red-100 bg-red-50/60 px-[8px] py-[7px] text-[10px] text-red-600">
              <AlertCircle size={12} strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{item.error || "Compression failed. Try a less aggressive target."}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Compress() {
  const { preset } = useParams();
  const path = preset ? "/compress/" + preset : "/compress";
  const seoPage = seoPageForPath(path);
  const routeTarget = seoPage?.targetMb ?? loadSavedTarget();
  const [defaultTargetMb, setDefaultTargetMb] = useState(routeTarget);
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const controllerRef = useRef(null);
  const runIdRef = useRef(0);

  useSeo({
    title: seoPage?.title || "Compress media",
    description: seoPage?.description || "Compress images, video, and audio to a target file size directly in your browser.",
    path,
    robots: preset && !seoPage ? "noindex, follow" : undefined,
    jsonLd: seoPage ? pageJsonLd(seoPage) : toolJsonLd({ name: "Media compressor", description: "Compress images, video, and audio to a target size.", path }),
  });

  useEffect(() => {
    if (seoPage?.targetMb != null) setDefaultTargetMb(seoPage.targetMb);
  }, [seoPage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mb: normalizeTarget(defaultTargetMb) }));
    } catch {
      /* Storage limits never block compression. */
    }
  }, [defaultTargetMb]);

  useEffect(() => {
    if (!rejected) return undefined;
    const timer = window.setTimeout(() => setRejected(0), 3200);
    return () => window.clearTimeout(timer);
  }, [rejected]);

  const estimates = useMemo(
    () => items.map((item) => estimateCompressedBytes(
      item.file,
      item.meta || {},
      item.settings,
      item.smartTarget,
      { mode: "size", mb: normalizeTarget(item.targetMb) },
    )),
    [items],
  );
  const hasFiles = items.length > 0;
  const totalInputBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const allDone = hasFiles && items.every((item) => item.status === "done");

  const patchItem = (id, patch) => setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));

  const resetItemResult = (item, patch) => ({
    ...item,
    ...patch,
    status: "idle",
    progress: 0,
    statusText: "",
    result: null,
    error: null,
  });

  const setItemTarget = (id, value) => {
    setItems((previous) => previous.map((item) => item.id === id
      ? resetItemResult(item, {
        targetMb: value,
        settings: automaticSettings(item.settings),
        smartTarget: true,
      })
      : item));
  };

  const commitItemTarget = (id) => {
    setItems((previous) => previous.map((item) => item.id === id
      ? { ...item, targetMb: normalizeTarget(item.targetMb) }
      : item));
  };

  const patchItemSettings = (id, patch) => {
    setItems((previous) => previous.map((item) => item.id === id
      ? resetItemResult(item, {
        settings: { ...item.settings, ...patch },
        smartTarget: false,
      })
      : item));
  };

  const addFiles = (files) => {
    const selected = Array.from(files);
    const accepted = selected.filter(isCompressibleMedia);
    const skipped = selected.length - accepted.length;
    if (skipped) setRejected((count) => count + skipped);
    const next = accepted.map((file) => makeItem(file, defaultTargetMb, seoPage?.targetPercent));
    if (!next.length) return;
    setItems((previous) => [...previous, ...next]);
    next.forEach(async (item) => {
      const meta = await probeMedia(item.file);
      patchItem(item.id, { meta });
    });
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

  const cancelAll = () => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setItems((previous) => previous.map((item) => item.status === "working" || item.status === "error"
      ? { ...item, status: "idle", progress: 0, statusText: "", error: null }
      : item));
  };

  const runAll = async () => {
    const controller = new AbortController();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    controllerRef.current = controller;
    setBusy(true);
    const active = () => !controller.signal.aborted && runIdRef.current === runId;
    try {
      for (const item of items) {
        if (!active()) break;
        if (item.status === "done") continue;
        patchItem(item.id, { status: "working", settingsOpen: false, progress: 0, statusText: "Preparing…", error: null });
        try {
          const result = await compressMedia(item.file, {
            mode: "size",
            mb: normalizeTarget(item.targetMb),
            settings: item.settings,
            smartTarget: item.smartTarget,
            meta: item.meta || undefined,
            signal: controller.signal,
            onStatus: (statusText) => active() && patchItem(item.id, { statusText }),
            onProgress: (progress) => active() && patchItem(item.id, { progress }),
          });
          if (!active()) break;
          patchItem(item.id, { status: "done", progress: 1, statusText: "", result });
        } catch (error) {
          if (error?.name === "AbortError" || !active()) break;
          patchItem(item.id, { status: "error", statusText: "", error: error?.message || "Compression failed" });
        }
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (runIdRef.current === runId) setBusy(false);
    }
  };

  const completedItems = () => items.filter((item) => item.status === "done" && item.result);

  const downloadIndividually = () => {
    completedItems().forEach((item, index) => window.setTimeout(() => downloadBlob(item.result.name, item.result.blob), index * 140));
  };

  const downloadZip = () => {
    const done = completedItems();
    if (!done.length) return;
    Promise.all(done.map(async (item) => ({ name: item.result.name, bytes: new Uint8Array(await item.result.blob.arrayBuffer()) }))).then((entries) => {
      const names = {};
      entries.forEach((entry) => {
        if (names[entry.name] != null) {
          names[entry.name] += 1;
          entry.name = entry.name.replace(/(\.[^.]+)$/, "-" + names[entry.name] + "$1");
        } else names[entry.name] = 0;
      });
      downloadBlob("filzy-compressed.zip", zipSync(entries));
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
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    };
    const drop = async (event) => {
      if (!hasFilesDrag(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      try {
        const gathered = await gatherDropItems(event.dataTransfer);
        addFiles(gathered.flatMap((entry) => entry.type === "folder" ? entry.files : [entry.file]));
      } catch {
        setRejected((count) => count + 1);
      }
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
  }, [defaultTargetMb, seoPage]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => {
    controllerRef.current?.abort();
    itemsRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
  }, []);

  const openPicker = () => inputRef.current?.click();

  return (
    <>
      <div className="flex min-h-[100svh] shrink-0 flex-col">
        <ToolShell align="left">
          <GlassCard width={hasFiles ? "max-w-[620px]" : "max-w-[400px]"} className="transition-[max-width] duration-300 ease-out">
            <AnimatePresence mode="wait" initial={false}>
              {!hasFiles ? (
                <motion.div key="empty" {...fade} className="flex flex-col gap-[7px]">
                  <TargetSizeField
                    value={defaultTargetMb}
                    onChange={setDefaultTargetMb}
                    onBlur={() => setDefaultTargetMb(normalizeTarget(defaultTargetMb))}
                    showIcon
                  />
                  <Dropzone
                    isDragging={isDragging}
                    onOpen={openPicker}
                    Icon={Plus}
                    title="Add media"
                    subtitle="Images, video, or audio"
                    dragTitle="Drop media to compress"
                    height="h-[158px]"
                  />
                </motion.div>
              ) : (
                <motion.div key="filled" {...fade} className="flex flex-col gap-[7px]">
                  <div className={cn("flex items-center justify-between rounded-[12px] border border-dashed border-border bg-bg p-[7px] pl-[10px] transition-colors", isDragging && "border-text bg-bg-hover")}>
                    <div className="flex min-w-0 items-center gap-[5px] text-[12px] text-alt-text">
                      <span>{items.length} file{items.length === 1 ? "" : "s"}</span>
                      <span className="h-[2.5px] w-[2.5px] rounded-full bg-border" />
                      <span>{formatBytes(totalInputBytes)}</span>
                    </div>
                    <GhostButton Icon={Plus} onClick={openPicker}>Add more</GhostButton>
                  </div>

                  <ScrollFadeList>
                    <AnimatePresence initial={false} mode="popLayout">
                      {items.map((item, index) => (
                        <motion.div key={item.id} {...rowMotion}>
                          <CompressRow
                            item={item}
                            estimate={estimates[index]}
                            onRemove={removeItem}
                            onCancel={cancelAll}
                            onToggleSettings={() => patchItem(item.id, { settingsOpen: !item.settingsOpen })}
                            onTargetChange={(value) => setItemTarget(item.id, value)}
                            onTargetCommit={() => commitItemTarget(item.id)}
                            onPreset={(mb) => setItemTarget(item.id, mb)}
                            onPatchSettings={(patch) => patchItemSettings(item.id, patch)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </ScrollFadeList>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {rejected > 0 && (
                <motion.div role="status" aria-live="polite" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex items-center gap-[6px] rounded-[10px] border border-amber-200 bg-amber-50 px-[9px] py-[7px] text-[10px] text-amber-700">
                    <AlertCircle size={12} strokeWidth={1.5} aria-hidden="true" />
                    Skipped {rejected} unsupported file{rejected === 1 ? "" : "s"}. Add images, video, or audio only.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-[6px]">
              <CtaButton
                label={allDone ? "Download all" : items.some((item) => item.status === "error") ? "Try failed again" : "Compress all"}
                busy={busy}
                busyLabel="Cancel compression"
                onCancel={cancelAll}
                disabled={!hasFiles}
                onClick={allDone ? downloadIndividually : runAll}
              />
              <AnimatePresence initial={false}>
                {allDone && (
                  <motion.button
                    type="button"
                    onClick={downloadZip}
                    initial={{ opacity: 0, scale: 0.8, filter: "blur(5px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.8, filter: "blur(5px)" }}
                    className="flex h-[38px] w-[38px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[10px] border border-border bg-white text-alt-text transition-colors hover:bg-white-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
                    aria-label="Download compressed files as a ZIP"
                  >
                    <FolderArchive size={16} strokeWidth={1.3} absoluteStrokeWidth aria-hidden="true" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          <input ref={inputRef} type="file" multiple hidden accept={COMPRESS_ACCEPT} onChange={onInputChange} />
        </ToolShell>
      </div>
      <SeoLandingContent page={seoPage} />
    </>
  );
}
