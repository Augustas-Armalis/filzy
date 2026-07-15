import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  File,
  Link2,
  Loader,
  Music2,
  Settings2,
  Video,
  X,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { ToolShell } from "@/components/ToolShell";
import { CtaButton, FormatMenu, GlassCard, ProgressBar, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { seoPageForPath } from "@/content/seoCatalog";
import { row as rowMotion } from "@/lib/motion";
import { downloadBlob } from "@/lib/zip";
import { pageJsonLd, useSeo, toolJsonLd } from "@/lib/seo";
import {
  TARGETS,
  audioChoices,
  availableTargets,
  defaultExtractSettings,
  findFormat,
  formatBytes,
  formatDuration,
  inspectMediaLink,
  outputSummary,
  patchTargetSettings,
  qualityChoices,
  resolveMedia,
} from "@/lib/extract";
import { extractMedia } from "@/lib/extractEngine";

let uid = 0;
const BITRATE_OPTIONS = [320, 256, 192, 128].map((value) => ({ value: String(value), label: `${value} kbps` }));
const CHANNEL_OPTIONS = [
  { id: "original", label: "Original" },
  { id: "mono", label: "Mono" },
];

const SOURCE_OPTIONS = [
  { value: "any", label: "Any", Icon: Link2 },
  { value: "youtube", label: "YouTube", favicon: "https://www.youtube.com/favicon.ico" },
  { value: "tiktok", label: "TikTok", favicon: "https://www.tiktok.com/favicon.ico" },
  { value: "instagram", label: "Instagram", favicon: "https://www.instagram.com/favicon.ico" },
  { value: "facebook", label: "Facebook", favicon: "https://www.facebook.com/favicon.ico" },
];
const TARGET_OPTIONS = TARGETS.map((option) => ({ ...option, Icon: option.kind === "audio" ? Music2 : Video }));

function platformFavicon(id) {
  return SOURCE_OPTIONS.find((option) => option.value === id)?.favicon || "";
}

function PickerMark({ option, className }) {
  if (option?.favicon) return <img src={option.favicon} alt="" width="16" height="16" className={cn("h-[16px] w-[16px] object-contain", className)} />;
  const Icon = option?.Icon || File;
  return <Icon size={16} strokeWidth={1.17} absoluteStrokeWidth className={cn("text-alt-text", className)} aria-hidden="true" />;
}

function HeroPicker({ label, value, options, onChange, ariaLabel, primaryCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  const place = () => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(Math.max(bounds.width, 210), window.innerWidth - 20);
    setRect({
      left: Math.max(10, Math.min(bounds.left, window.innerWidth - width - 10)),
      top: bounds.bottom + 6,
      width,
    });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (triggerRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    let frame;
    const reposition = (event) => {
      if (popupRef.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-[64px] min-w-0 flex-1 cursor-pointer touch-manipulation items-center gap-[8px] rounded-[12px] border border-border bg-white p-[7px] text-left transition-[background-color,border-color,box-shadow] duration-150 hover:bg-white-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
      >
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-bg">
          <PickerMark option={selected} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] leading-[13px] text-alt-text">{label}</span>
          <span className="block truncate text-[14px] leading-[18px] text-text">{selected.label}</span>
        </span>
        <ChevronDown size={14} strokeWidth={1.17} absoluteStrokeWidth className={cn("mr-[2px] shrink-0 text-alt-text transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: -4, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(6px)" }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 90 }}
              className="overflow-hidden rounded-[12px] border border-border bg-white/95 p-[4px] shadow-xl backdrop-blur-[20px]"
            >
              {options.map((option, index) => (
                <div key={option.value}>
                  {primaryCount > 0 && index === primaryCount && <div className="mx-[6px] my-[4px] h-px bg-border" />}
                  <button
                    type="button"
                    disabled={option.disabled}
                    onClick={() => { onChange(option.value); setOpen(false); }}
                    className={cn(
                      "flex h-[40px] w-full touch-manipulation items-center gap-[8px] rounded-[9px] px-[8px] text-left transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
                      option.disabled ? "cursor-not-allowed text-dalt-text" : "cursor-pointer text-text hover:bg-bg",
                      option.value === value && "bg-bg",
                    )}
                  >
                    <span className={cn("flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border bg-white", option.disabled && "opacity-45")}><PickerMark option={option} /></span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{option.label}</span>
                    {option.disabled ? <span className="text-[9px] text-dalt-text">Soon</span> : option.value === value ? <Check size={13} strokeWidth={1.5} aria-hidden="true" /> : null}
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function TargetIcon({ target, className }) {
  const Icon = ["mp3", "m4a"].includes(target) ? Music2 : Video;
  return <Icon size={14} strokeWidth={1.17} absoluteStrokeWidth className={className} aria-hidden="true" />;
}

function PlatformMark({ source = "youtube", active = false, className }) {
  return (
    <span className={cn("relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border", active ? "border-red-100 bg-red-50" : "border-border bg-bg", className)}>
      {active && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[4px] rounded-[7px] bg-red-100/70"
          animate={{ opacity: [0.2, 0.65, 0.2], scale: [0.7, 1, 0.7] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <img src={platformFavicon(source)} alt="" width="16" height="16" className={cn("relative h-[16px] w-[16px]", !active && "grayscale opacity-70")} />
    </span>
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
      className="flex max-h-[440px] flex-col gap-[4px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  );
}

function SettingCell({ label, hint, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px] rounded-[10px] border border-border bg-white p-[7px]">
      <div className="flex min-w-0 items-baseline justify-between gap-[8px] px-[2px]">
        <span className="truncate text-[11px] text-alt-text">{label}</span>
        {hint && <span className="shrink-0 text-[9px] text-dalt-text">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ExtractSettings({ item, onPatch }) {
  const settings = item.settings;
  const qualities = qualityChoices(item.media, settings.target);
  const audio = audioChoices(item.media, settings.target);
  const isVideo = ["mp4", "webm"].includes(settings.target);

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(8px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: "blur(8px)" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="border-t border-border bg-bg p-[6px]"
    >
      <div className="grid gap-[5px] sm:grid-cols-2">
        <SettingCell label={isVideo ? "Original video quality" : "Original audio source"} hint="Real source">
          <FormatMenu
            ariaLabel={isVideo ? "Choose original video quality" : "Choose original audio source"}
            value={settings.formatId}
            options={qualities}
            onChange={(formatId) => onPatch({ settings: { ...settings, formatId } })}
          />
        </SettingCell>

        {isVideo ? (
          <SettingCell label="Audio track" hint="No re-encode">
            <FormatMenu
              ariaLabel="Choose source audio track"
              value={settings.includeAudio ? settings.audioId : "none"}
              options={[{ value: "none", label: "Video only", description: "Remove the audio track" }, ...audio]}
              onChange={(audioId) => onPatch({ settings: { ...settings, includeAudio: audioId !== "none", audioId: audioId === "none" ? settings.audioId : audioId } })}
            />
          </SettingCell>
        ) : settings.target === "mp3" ? (
          <SettingCell label="MP3 output bitrate" hint="Source stays honest">
            <FormatMenu
              ariaLabel="Choose MP3 bitrate"
              value={settings.bitrate}
              options={BITRATE_OPTIONS}
              onChange={(bitrate) => onPatch({ settings: { ...settings, bitrate } })}
            />
          </SettingCell>
        ) : null}

        {!isVideo && settings.target === "mp3" && (
          <SettingCell label="Channels" hint="Optional downmix">
            <Segmented
              options={CHANNEL_OPTIONS}
              value={settings.channels}
              onChange={(channels) => onPatch({ settings: { ...settings, channels } })}
            />
          </SettingCell>
        )}
      </div>
    </motion.div>
  );
}

function MediaRow({ item, onPatch, onRemove, onCancel }) {
  const targetOptions = availableTargets(item.media).map((option) => ({ value: option.value, label: option.label }));
  const done = item.status === "done";
  const working = item.status === "working";
  const error = item.status === "error";
  const chosenFormat = findFormat(item.media, item.settings.formatId);
  const selectedDetails = [
    outputSummary(item.media, item.settings),
    chosenFormat?.bytes ? formatBytes(chosenFormat.bytes) : null,
  ].filter(Boolean).join(" · ");

  const changeTarget = (target) => onPatch({
    settings: patchTargetSettings(item.media, item.settings, target),
    result: null,
    status: "ready",
    error: "",
  });

  return (
    <div className={cn("overflow-hidden rounded-[12px] border bg-white transition-colors duration-150", error ? "border-red-200" : done ? "border-green-200" : "border-border")}>
      <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-[8px] p-[6px] sm:grid-cols-[72px_minmax(0,1fr)_auto]">
        <div className="relative h-[48px] w-[64px] overflow-hidden rounded-[8px] border border-border bg-bg sm:w-[72px]">
          <img src={item.media.thumbnail} alt="" width="144" height="96" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute bottom-[3px] right-[3px] rounded-[4px] bg-black/75 px-[4px] py-[1px] text-[8px] tabular-nums text-white">
            {formatDuration(item.media.durationSeconds)}
          </span>
        </div>

        <div className="flex min-w-0 flex-col pr-[2px]">
          <p className="truncate text-[13px] leading-[17px] text-text">{item.media.title}</p>
          <div className="flex min-w-0 items-center gap-[5px] text-[10px] leading-[14px] text-alt-text">
            <span className="truncate">{item.media.author}</span>
            <span className="text-dalt-text">·</span>
            <span className="shrink-0">{selectedDetails}</span>
          </div>
          {(working || error) && (
            <div className="mt-[4px] flex min-w-0 flex-col gap-[3px]" aria-live="polite">
              {working && <ProgressBar value={item.progress} className="h-[4px]" />}
              <p className={cn("truncate text-[9px] leading-[12px]", error ? "text-red-600" : "text-alt-text")}>{error ? item.error : item.statusText}</p>
            </div>
          )}
        </div>

        <div className="col-span-2 flex min-w-0 items-center justify-end gap-[5px] sm:col-span-1">
          <a
            href={item.media.url}
            target="_blank"
            rel="noreferrer"
            className="hidden h-[36px] cursor-pointer items-center gap-[5px] rounded-[10px] border border-border bg-bg px-[9px] text-alt-text transition-[background-color,color] duration-150 hover:bg-white-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 md:flex"
            aria-label={`Open ${item.media.title} on ${item.media.provider?.label || "the source site"}`}
          >
            <img src={platformFavicon(item.media.provider?.id)} alt="" width="13" height="13" className="h-[13px] w-[13px]" />
            <span className="text-[12px]">{item.media.provider?.label || "Source"}</span>
          </a>
          <ArrowRight size={14} strokeWidth={1.17} absoluteStrokeWidth className="hidden shrink-0 text-dalt-text sm:block" aria-hidden="true" />

          {done ? (
            <div className="flex h-[36px] min-w-[92px] items-center justify-center gap-[5px] rounded-[10px] border border-green-200 bg-green-50 px-[10px] text-green-700">
              <TargetIcon target={item.settings.target} className="text-green-700" />
              <span className="text-[13px]">{item.settings.target.toUpperCase()}</span>
              <Check size={13} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
            </div>
          ) : (
            <div className="min-w-0 flex-1 sm:w-[104px] sm:flex-none">
              <FormatMenu
                ariaLabel={`Choose output format for ${item.media.title}`}
                value={item.settings.target}
                options={targetOptions}
                onChange={changeTarget}
                disabled={working}
              />
            </div>
          )}

          {done && (
            <button
              type="button"
              onClick={() => downloadBlob(item.result.name, item.result.blob)}
              className="flex h-[36px] w-[36px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[10px] bg-text text-white transition-colors hover:bg-text-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
              aria-label={`Download ${item.result.name}`}
            >
              <Download size={15} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />
            </button>
          )}

          {!done && !working && (
            <button
              type="button"
              onClick={() => onPatch({ advanced: !item.advanced })}
              aria-expanded={item.advanced}
              aria-label={`Adjust extraction settings for ${item.media.title}`}
              className={cn(
                "flex h-[36px] w-[36px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[10px] border transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20",
                item.advanced ? "border-text bg-text text-white" : "border-border bg-white text-alt-text hover:bg-bg hover:text-text",
              )}
            >
              <Settings2 size={15} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={working ? onCancel : () => onRemove(item.id)}
            className="flex h-[36px] w-[36px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-[10px] text-alt-text transition-[background-color,color] duration-150 hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
            aria-label={working ? "Cancel extraction" : `Remove ${item.media.title}`}
          >
            <X size={15} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {item.advanced && !done && !working && <ExtractSettings item={item} onPatch={onPatch} />}
      </AnimatePresence>
    </div>
  );
}

export default function Extract() {
  const { preset } = useParams();
  const path = preset ? `/extract/${preset}` : "/extract";
  const seoPage = seoPageForPath(path);
  const [draft, setDraft] = useState("");
  const [preferredSource, setPreferredSource] = useState("any");
  const [preferredTarget, setPreferredTarget] = useState(seoPage?.target || "mp4");
  const [items, setItems] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [resolveStatus, setResolveStatus] = useState("");
  const [inputError, setInputError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const resolveAbortRef = useRef(null);
  const jobAbortRef = useRef(null);

  useSeo({
    title: seoPage?.title || "Extract video & audio",
    description: seoPage?.description || "Inspect the real qualities available for a media link, then save original video or locally converted audio with Filzy.",
    path,
    robots: preset && !seoPage ? "noindex, follow" : undefined,
    jsonLd: seoPage ? pageJsonLd(seoPage) : toolJsonLd({ name: "Media extractor", description: "Resolve real source formats and extract video or audio locally.", path }),
  });

  useEffect(() => {
    if (seoPage?.target) setPreferredTarget(seoPage.target);
  }, [seoPage]);

  const inspection = useMemo(() => inspectMediaLink(draft), [draft]);
  const hasItems = items.length > 0;
  const allDone = hasItems && items.every((item) => item.status === "done");
  const liveMessage = inputError || (inspection.state === "supported" ? inspection.message : (/^https?:\/\//i.test(draft) ? inspection.message : ""));

  const patchItem = (id, patch) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeItem = (id) => setItems((current) => current.filter((item) => item.id !== id));
  const applyPreferredTarget = (target) => {
    setPreferredTarget(target);
    setItems((current) => current.map((item) => (
      availableTargets(item.media).some((option) => option.value === target)
        ? { ...item, settings: patchTargetSettings(item.media, item.settings, target), result: null, status: "ready", error: "" }
        : item
    )));
  };

  const addLink = async (raw = draft) => {
    const checked = inspectMediaLink(raw);
    if (checked.state !== "supported") {
      setInputError(checked.message || "Paste a supported media link.");
      inputRef.current?.focus();
      return;
    }
    if (items.some((item) => item.media.url === checked.source.url)) {
      setInputError("That video is already in the list.");
      return;
    }

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    setResolving(true);
    setInputError("");
    setResolveStatus("Reading source…");
    try {
      const media = await resolveMedia(checked.source, { signal: controller.signal, onPhase: setResolveStatus });
      const settings = defaultExtractSettings(media, preferredTarget);
      setPreferredSource(checked.source.id);
      setItems((current) => [...current, {
        id: ++uid,
        media,
        settings,
        advanced: false,
        status: "ready",
        statusText: "",
        progress: 0,
        result: null,
        error: "",
      }]);
      setDraft("");
      setResolveStatus("");
      inputRef.current?.focus();
    } catch (error) {
      if (error?.name !== "AbortError") setInputError(error?.message || "Could not inspect this link. Try another video.");
    } finally {
      if (resolveAbortRef.current === controller) resolveAbortRef.current = null;
      setResolving(false);
    }
  };

  const onPaste = (event) => {
    const pasted = event.clipboardData.getData("text").trim();
    if (inspectMediaLink(pasted).state === "supported") setTimeout(() => addLink(pasted), 0);
  };

  const cancelJobs = () => {
    jobAbortRef.current?.abort();
    jobAbortRef.current = null;
  };

  const runAll = async () => {
    if (allDone) {
      items.forEach((item) => downloadBlob(item.result.name, item.result.blob));
      return;
    }
    const pending = items.filter((item) => item.status !== "done");
    if (!pending.length) return;
    const controller = new AbortController();
    jobAbortRef.current = controller;
    setBusy(true);

    for (const item of pending) {
      if (controller.signal.aborted) break;
      patchItem(item.id, { status: "working", progress: 0, statusText: "Starting…", error: "", advanced: false });
      try {
        const result = await extractMedia(item.media, item.settings, {
          signal: controller.signal,
          onProgress: (progress) => patchItem(item.id, { progress }),
          onPhase: (statusText) => patchItem(item.id, { statusText }),
        });
        patchItem(item.id, { status: "done", progress: 1, statusText: "Ready", result });
        if (items.length === 1) downloadBlob(result.name, result.blob);
      } catch (error) {
        if (error?.name === "AbortError") {
          patchItem(item.id, { status: "ready", progress: 0, statusText: "", error: "" });
          break;
        }
        patchItem(item.id, { status: "error", progress: 0, statusText: "", error: error?.message || "Extraction failed. Try another format." });
      }
    }

    if (jobAbortRef.current === controller) jobAbortRef.current = null;
    setBusy(false);
  };

  return (
    <>
    <div className="flex min-h-[100svh] shrink-0 flex-col">
    <ToolShell align="left">
      <GlassCard width={hasItems ? "max-w-[720px]" : "max-w-[400px]"} className="transition-[max-width] duration-300">
        <div className="mx-auto flex w-full max-w-[380px] items-center gap-[8px]">
          <HeroPicker
            label="From"
            value={preferredSource}
            options={SOURCE_OPTIONS}
            onChange={setPreferredSource}
            ariaLabel="Choose media source"
            primaryCount={2}
          />
          <ArrowRight size={14} strokeWidth={1.17} absoluteStrokeWidth className="shrink-0 text-dalt-text" aria-hidden="true" />
          <HeroPicker
            label="To"
            value={preferredTarget}
            options={TARGET_OPTIONS}
            onChange={applyPreferredTarget}
            ariaLabel="Choose output format"
            primaryCount={2}
          />
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); addLink(); }}
          className={cn(
            "flex min-w-0 items-center gap-[7px] rounded-[12px] border bg-white p-[6px] transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-text/15",
            inputError ? "border-red-200" : inspection.state === "supported" ? "border-red-100" : "border-border",
          )}
        >
          {inspection.state === "supported" ? <PlatformMark source={inspection.source?.id} active /> : (
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-bg">
              <Link2 size={15} strokeWidth={1.17} absoluteStrokeWidth className="text-alt-text" aria-hidden="true" />
            </span>
          )}
          <label htmlFor="extract-media-link" className="sr-only">YouTube video link</label>
          <input
            ref={inputRef}
            id="extract-media-link"
            name="media-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            disabled={resolving}
            onChange={(event) => { setDraft(event.target.value); setInputError(""); }}
            onPaste={onPaste}
            placeholder="Paste a media link…"
            className="h-[34px] min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-dalt-text disabled:cursor-wait"
          />
        </form>

        <AnimatePresence mode="wait" initial={false}>
          {(resolving || liveMessage) && (
            <div className="px-[4px]" aria-live="polite">
              <motion.p
                key={resolving ? resolveStatus : liveMessage}
                initial={{ opacity: 0, filter: "blur(5px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(5px)" }}
                className={cn("flex items-center gap-[5px] text-[10px] leading-[14px]", inputError || inspection.state === "unsupported" ? "text-red-600" : "text-alt-text")}
              >
                {resolving && <Loader size={11} strokeWidth={1.4} absoluteStrokeWidth className="animate-spin" aria-hidden="true" />}
                {resolving ? resolveStatus : liveMessage}
              </motion.p>
            </div>
          )}
        </AnimatePresence>

        {hasItems && (
          <ScrollFadeList>
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.div key={item.id} {...rowMotion}>
                  <MediaRow
                    item={item}
                    onPatch={(patch) => patchItem(item.id, patch)}
                    onRemove={removeItem}
                    onCancel={cancelJobs}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </ScrollFadeList>
        )}

        <CtaButton
          label={allDone ? "Download all" : hasItems && items.length > 1 ? "Extract all" : "Extract"}
          disabled={!hasItems && (inspection.state !== "supported" || resolving)}
          busy={busy || resolving}
          busyLabel={resolving ? "Reading source…" : "Extracting…"}
          onCancel={hasItems ? cancelJobs : undefined}
          onClick={hasItems ? runAll : () => addLink()}
        />
      </GlassCard>
    </ToolShell>
    </div>
    </>
  );
}
