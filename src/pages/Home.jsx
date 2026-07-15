import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, Radio, WavesLadder, Loader } from "lucide-react";
import { useLocation } from "react-router-dom";
import { DropBox, FileList } from "@/components/BeamUpload";
import { Streaming, StreamStopped } from "@/components/Streaming";
import { basePages, seoPageForPath } from "@/content/seoCatalog";
import { useBeamHost } from "@/hooks/useBeamHost";
import { cn } from "@/lib/cn";
import { gatherDropItems, kindOf } from "@/lib/files";
import { pageJsonLd, useSeo } from "@/lib/seo";

const TABS = [
  {
    id: "drop",
    label: "Drop",
    Icon: Cloud,
    comingSoon: true,
    title: "Comming soon!",
    subtitle: "1 GB free. Sign up for 3 GB free",
    cta: "Get a link",
  },
  {
    id: "beam",
    label: "Beam",
    Icon: Radio,
    comingSoon: false,
    cta: "Start streaming",
  },
  {
    id: "pool",
    label: "Pool",
    Icon: WavesLadder,
    comingSoon: true,
    title: "Comming soon!",
    subtitle: "Let everyone upload & download in one place",
    cta: "Start a pool",
  },
];

// Blur fade for tab content + CTA label.
const swap = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(12px)" },
  transition: { duration: 0.4, ease: "easeInOut" },
};

// Fast, instant-start blur fade for the empty⇄filled swap (no out-then-in wait).
const fade = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  transition: { duration: 0.2, ease: "easeOut" },
};

// Blur fade between major phases (upload ⇄ live ⇄ stopped): old out, then new in.
// transitionEnd clears the filter so it doesn't break the cards' backdrop-blur at rest.
const phaseSwap = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: { opacity: 0, filter: "blur(12px)" },
  transition: { duration: 0.3, ease: "easeInOut" },
};

let uid = 0;

// Turn gathered drop entries / picked files into list items.
function toItems(gathered) {
  return gathered.map((g) => {
    if (g.type === "folder") {
      const size = g.files.reduce((s, f) => s + f.size, 0);
      return { id: ++uid, kind: "folder", name: g.name, fileCount: g.files.length, size, files: g.files };
    }
    const kind = kindOf(g.file);
    const url = kind === "image" || kind === "video" ? URL.createObjectURL(g.file) : null;
    return { id: ++uid, kind, file: g.file, url };
  });
}

// Coming-soon placeholder shown for Drop / Pool.
function ComingSoonBox({ title, subtitle }) {
  return (
    <div className="flex h-[142px] items-center justify-center rounded-[12px] border border-dashed border-border bg-bg">
      <div className="flex flex-col items-center justify-center gap-[10px]">
        <div className="relative h-[44px] w-[48px]">
          <div className="absolute inset-0 m-auto h-[32px] w-[32px] -translate-x-[2px] translate-y-[4px] -rotate-[15deg] rounded-[9px] border border-border bg-white" />
          <div className="absolute inset-0 m-auto flex h-[32px] w-[32px] translate-x-[6.5px] -translate-y-[-4px] rotate-[15deg] items-center justify-center rounded-[9px] border border-border bg-white">
            <Loader size={16} strokeWidth={1.17} absoluteStrokeWidth className="animate-spin text-text" style={{ animationDuration: "2.4s" }} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-[0px]">
          <p className="text-[14px] text-alt-text">{title}</p>
          <p className="text-[11px] text-dalt-text">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const location = useLocation();
  const seoPage = seoPageForPath(location.pathname) || basePages[0];
  const [activeId, setActiveId] = useState("beam");
  const [phase, setPhase] = useState("upload"); // upload | live | stopped
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [cardHeight, setCardHeight] = useState();
  const dragDepth = useRef(0);
  const inputRef = useRef(null);
  const innerRef = useRef(null);
  const beam = useBeamHost();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const view = TABS.find((t) => t.id === activeId);
  const comingSoon = view.comingSoon;
  const hasFiles = items.length > 0;

  useSeo({
    title: seoPage.title,
    description: seoPage.description,
    path: seoPage.path,
    jsonLd: pageJsonLd(seoPage),
  });

  const openPicker = () => inputRef.current?.click();

  // Add items to the list — and, if a beam is live, into the running transfer
  // (the host rebroadcasts its manifest so recipients see the new files).
  const addNewItems = (newItems) => {
    if (!newItems.length) return;
    setItems((prev) => [...prev, ...newItems]);
    if (phaseRef.current === "live") beam.addItems(newItems);
  };

  const onInputChange = (e) => {
    if (e.target.files?.length) {
      const gathered = Array.from(e.target.files).map((file) => ({ type: "file", file }));
      addNewItems(toItems(gathered));
    }
    e.target.value = ""; // let the same file be picked again later
  };

  const removeItem = (id) =>
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it?.url) URL.revokeObjectURL(it.url);
      if (it && phaseRef.current === "live") beam.removeItem(it);
      return prev.filter((p) => p.id !== id);
    });

  // Smoothly animate the card's height as its content grows/shrinks.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setCardHeight(el.offsetHeight + 2); // +2 for the card's border
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Revoke any leftover object URLs when the page unmounts.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => itemsRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url)),
    [],
  );

  // Drag-and-drop anywhere on the page adds files/folders (and jumps to Beam).
  useEffect(() => {
    const hasDragFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const reset = () => {
      dragDepth.current = 0;
      setIsDragging(false);
    };
    const onEnter = (e) => {
      if (!hasDragFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };
    const onOver = (e) => {
      if (hasDragFiles(e)) e.preventDefault();
    };
    const onLeave = (e) => {
      if (!hasDragFiles(e)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) reset();
    };
    const onDrop = async (e) => {
      if (!hasDragFiles(e)) return;
      e.preventDefault();
      reset();
      if (phaseRef.current === "stopped") return; // nothing to add to once stopped
      try {
        const gathered = await gatherDropItems(e.dataTransfer);
        if (gathered.length) {
          addNewItems(toItems(gathered));
          setActiveId("beam");
        }
      } catch {
        // A failed read shouldn't break the page; the drop is simply ignored.
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", reset); // recover if a drag is canceled (Esc, etc.)
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
    };
  }, []);

  const ctaReady = hasFiles; // only Beam can hold files
  const ctaClass = ctaReady
    ? "cursor-pointer hover:bg-text-hover"
    : comingSoon
      ? "pointer-events-none opacity-50"
      : "pointer-events-none opacity-80";

  return (
    <>
      <div className="flex min-h-[100svh] shrink-0 items-center justify-center px-[10px] pt-[60px] pb-[44px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
        <AnimatePresence mode="wait">
        {phase === "upload" ? (
        <motion.div key="upload" {...phaseSwap} className="w-full max-w-[280px]">
        <motion.div
          animate={{ height: cardHeight ?? "auto" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-white/20 bg-white/50 backdrop-blur-[16px]"
        >
          <div ref={innerRef} className="flex flex-col gap-[8px] p-[8px]">

            {/* Empty (tabs + add-files / coming-soon) ⇄ filled (file list) — instant blur swap */}
            {hasFiles ? (
              <motion.div key="filled" {...fade}>
                <FileList
                  items={items}
                  onRemove={removeItem}
                  onOpen={openPicker}
                  note={note}
                  setNote={setNote}
                  isDragging={isDragging}
                />
              </motion.div>
            ) : (
              <motion.div key="empty" {...fade} className="flex flex-col gap-[8px]">
                {/* Tabs — Beam active by default; all three clickable */}
                <div className="flex w-full flex-row items-center justify-center gap-[4px]">
                  {TABS.map(({ id, label, Icon }) => {
                    const isActive = id === activeId;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveId(id)}
                        className={cn(
                          "flex h-[32px] w-full cursor-pointer items-center justify-center gap-[4px] rounded-[9px] border transition-all duration-150",
                          isActive
                            ? "border-text bg-text hover:border-text-hover hover:bg-text-hover"
                            : "border-border bg-white hover:bg-white-hover",
                        )}
                      >
                        <Icon
                          size={16}
                          strokeWidth={1.33}
                          absoluteStrokeWidth
                          className={cn("transition-colors duration-150", isActive ? "text-white" : "text-alt-text")}
                        />
                        <span
                          className={cn(
                            "text-[14px] transition-colors duration-150",
                            isActive ? "text-white" : "text-alt-text",
                          )}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Per-tab content (blur-fades on tab switch) */}
                <motion.div key={activeId} {...swap}>
                  {activeId === "beam" ? (
                    <DropBox isDragging={isDragging} onOpen={openPicker} />
                  ) : (
                    <ComingSoonBox title={view.title} subtitle={view.subtitle} />
                  )}
                </motion.div>
              </motion.div>
            )}

            {/* CTA — persistent. 80% + locked empty, 50% coming-soon, lit + clickable with files */}
            <div
              onClick={() => {
                if (!ctaReady) return;
                beam.start(items, note);
                setPhase("live");
              }}
              className={cn("relative flex h-[38px] w-full items-center justify-center rounded-[11px] bg-text transition-all duration-150", ctaClass)}
            >
              <AnimatePresence>
                <motion.p key={view.cta} {...swap} className="absolute inset-0 flex items-center justify-center font-normal font-casser text-[16px] text-white">
                  {view.cta}
                </motion.p>
              </AnimatePresence>
            </div>

          </div>
        </motion.div>
        </motion.div>
        ) : phase === "stopped" ? (
          <motion.div key="stopped" {...phaseSwap}>
            <StreamStopped onUploadMore={() => window.location.reload()} />
          </motion.div>
        ) : (
          <motion.div key="live" {...phaseSwap}>
            <Streaming
              items={items}
              users={beam.users}
              speed={beam.aggregateSpeed}
              shareUrl={beam.shareUrl}
              onStop={() => {
                beam.stop();
                setPhase("stopped");
              }}
              onKick={beam.kick}
              onOverdrive={beam.setOverdrive}
              onAddMore={openPicker}
              onRemove={removeItem}
              isDragging={isDragging}
            />
          </motion.div>
        )}
        </AnimatePresence>
      </div>


      <input ref={inputRef} type="file" multiple hidden onChange={onInputChange} />
    </>
  );
}
