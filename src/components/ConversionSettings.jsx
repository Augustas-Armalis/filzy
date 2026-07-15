import { Link2, Link2Off, Volume2, VolumeX } from "lucide-react";
import { Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";

const QUALITY = [
  { id: "small", label: "Smaller" },
  { id: "balanced", label: "Balanced" },
  { id: "best", label: "Best" },
];

const RESOLUTION = [
  { id: "original", label: "Original" },
  { id: "1080", label: "1080p" },
  { id: "720", label: "720p" },
  { id: "480", label: "480p" },
];

function SettingRow({ title, description, children, className }) {
  return (
    <div className={cn("flex min-h-[50px] flex-col gap-[8px] rounded-[10px] border border-border bg-white p-[8px] sm:flex-row sm:items-center", className)}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] leading-[17px] text-text">{title}</span>
        {description && <span className="text-[10px] leading-[14px] text-alt-text">{description}</span>}
      </div>
      <div className="min-w-0 shrink-0 sm:w-[300px]">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, placeholder, min = 1 }) {
  return (
    <input
      type="number"
      min={min}
      value={value || ""}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      placeholder={placeholder}
      className="h-[32px] min-w-0 w-full rounded-[8px] border border-border bg-bg px-[8px] text-[12px] text-text outline-none transition-colors placeholder:text-dalt-text focus:border-text/40"
    />
  );
}

function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative ml-auto h-[20px] w-[34px] cursor-pointer rounded-full transition-colors", on ? "bg-text" : "bg-border")}
    >
      <span className={cn("absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform", on ? "translate-x-[17px]" : "translate-x-[3px]")} />
    </button>
  );
}

function ToggleRow({ on, onChange, IconOn, IconOff, title, subtitle }) {
  const Icon = on ? IconOn : IconOff;
  return (
    <div className="flex min-h-[50px] items-center gap-[9px] rounded-[10px] border border-border bg-white p-[8px]">
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border border-border bg-bg">
        <Icon size={14} strokeWidth={1.4} absoluteStrokeWidth className="text-alt-text" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] leading-[17px] text-text">{title}</span>
        <span className="text-[10px] leading-[14px] text-alt-text">{subtitle}</span>
      </div>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

export function defaultConversionSettings(category, target) {
  if (target === "svg") return {
    svgQuality: "fine",
    svgFilter: "edge2",
    svgColors: 2,
    svgTransparent: true,
    svgInvert: false,
    svgMonochrome: true,
    svgColor: "#111111",
    svgThreshold: 242,
  };
  if (target === "gif") return { quality: "balanced", width: 480, fps: 12, loop: true };
  if (category === "image") return { quality: "balanced", width: null, height: null, lockAspect: true };
  if (category === "video") return { quality: "balanced", resolution: "original", fps: "original", mute: false };
  if (category === "audio") return { quality: "balanced", bitrate: "192", sampleRate: "auto", mono: false };
  return { quality: "balanced" };
}

export function ConversionSettings({ category, target, value, onChange }) {
  const patch = (next) => onChange({ ...value, ...next });

  if (target === "gif") {
    return (
      <div className="flex flex-col gap-[5px]">
        <SettingRow title="GIF width" description="Resize while keeping the source proportions">
          <Segmented value={String(value.width || 480)} onChange={(width) => patch({ width: Number(width) })} options={[{ id: "320", label: "320" }, { id: "480", label: "480" }, { id: "720", label: "720" }]} />
        </SettingRow>
        <SettingRow title="Frame rate" description="More frames create smoother, larger files">
          <Segmented value={String(value.fps || 12)} onChange={(fps) => patch({ fps: Number(fps) })} options={[{ id: "8", label: "8 fps" }, { id: "12", label: "12 fps" }, { id: "18", label: "18 fps" }]} />
        </SettingRow>
      </div>
    );
  }

  if (category === "image") {
    return (
      <div className="flex flex-col gap-[5px]">
        <SettingRow title="Output quality" description="Balance detail against the final file size">
          <Segmented options={QUALITY} value={value.quality || "balanced"} onChange={(quality) => patch({ quality })} />
        </SettingRow>
        <SettingRow title="Image size" description="Leave both fields empty to keep the original size">
          <div className="grid grid-cols-[1fr_32px_1fr] items-center gap-[5px]">
            <NumberInput value={value.width} onChange={(width) => patch({ width })} placeholder="Width" />
            <button
              type="button"
              onClick={() => patch({ lockAspect: !value.lockAspect })}
              title={value.lockAspect ? "Keep proportions" : "Resize freely"}
              className={cn("flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[8px] border transition-all", value.lockAspect ? "border-text bg-text text-white" : "border-border bg-bg text-alt-text hover:bg-bg-hover")}
            >
              {value.lockAspect ? <Link2 size={13} /> : <Link2Off size={13} />}
            </button>
            <NumberInput value={value.height} onChange={(height) => patch({ height })} placeholder="Height" />
          </div>
        </SettingRow>
      </div>
    );
  }

  if (category === "video") {
    return (
      <div className="flex flex-col gap-[5px]">
        <SettingRow title="Output quality" description="Balance visual detail against file size">
          <Segmented options={QUALITY} value={value.quality || "balanced"} onChange={(quality) => patch({ quality })} />
        </SettingRow>
        <SettingRow title="Resolution" description="Keep the source size or scale it down">
          <Segmented options={RESOLUTION} value={value.resolution || "original"} onChange={(resolution) => patch({ resolution })} />
        </SettingRow>
        <SettingRow title="Frame rate" description="Original preserves the source timing">
          <Segmented options={[{ id: "original", label: "Original" }, { id: "24", label: "24 fps" }, { id: "30", label: "30 fps" }]} value={String(value.fps || "original")} onChange={(fps) => patch({ fps })} />
        </SettingRow>
        <ToggleRow on={Boolean(value.mute)} onChange={(mute) => patch({ mute })} IconOn={VolumeX} IconOff={Volume2} title="Remove audio" subtitle="Export the video without its audio track" />
      </div>
    );
  }

  if (category === "audio") {
    return (
      <div className="flex flex-col gap-[5px]">
        <SettingRow title="Audio quality" description="Choose a smaller file or preserve more detail">
          <Segmented options={QUALITY} value={value.quality || "balanced"} onChange={(quality) => patch({ quality })} />
        </SettingRow>
        <SettingRow title="Bitrate" description="Higher bitrates keep more audio information">
          <Segmented options={[{ id: "128", label: "128k" }, { id: "192", label: "192k" }, { id: "320", label: "320k" }]} value={String(value.bitrate || "192")} onChange={(bitrate) => patch({ bitrate })} />
        </SettingRow>
        <SettingRow title="Sample rate" description="Auto keeps the source rate where possible">
          <Segmented options={[{ id: "auto", label: "Auto" }, { id: "44100", label: "44.1k" }, { id: "48000", label: "48k" }]} value={String(value.sampleRate || "auto")} onChange={(sampleRate) => patch({ sampleRate })} />
        </SettingRow>
        <ToggleRow on={Boolean(value.mono)} onChange={(mono) => patch({ mono })} IconOn={Volume2} IconOff={Volume2} title="Mono audio" subtitle="Mix both channels into one" />
      </div>
    );
  }

  return <p className="rounded-[10px] border border-border bg-white p-[10px] text-[12px] text-alt-text">This format keeps the original file unchanged.</p>;
}
