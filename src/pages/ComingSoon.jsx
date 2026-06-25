import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { takePhoto, refillPhotos, withParams } from "@/lib/unsplash";

/*
  Public landing at "/".

  The "coming soon..." card paints immediately on the dark background — it never
  waits on the photo or the network. The background photo URL is chosen
  synchronously (from a local cache of Unsplash photos, or a curated fallback),
  then loaded progressively: tiny blurred placeholder → mid → full (premium).
  Endless random photos via the Unsplash API are topped up in the background.
  Portrait photos on mobile, landscape on larger screens.
*/
export default function ComingSoon() {
  const [bg] = useState(() => {
    const orientation =
      window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
    const photo = takePhoto(orientation);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = (n) => Math.min(Math.round(n * dpr), 2560);
    const w = cap(window.innerWidth);
    const h = cap(window.innerHeight);
    const at = (div, q) =>
      withParams(
        photo.raw,
        `fit=crop&crop=entropy&auto=format&w=${Math.max(
          16,
          Math.round(w / div)
        )}&h=${Math.max(16, Math.round(h / div))}&q=${q}`
      );

    return {
      orientation,
      name: photo.name || null,
      profile: photo.profile || null,
      stages: [
        at(26, 25), // super-low, blurred (~1KB)
        at(3, 55), // mid quality (fast on slow wifi)
        withParams(
          photo.raw,
          `fit=crop&crop=entropy&auto=format&w=${w}&h=${h}&q=85`
        ), // full, premium
      ],
    };
  });

  const [done, setDone] = useState([false, false, false]);

  useEffect(() => {
    refillPhotos(bg.orientation); // top up endless photos for next visits
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#050505";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [bg.orientation]);

  return (
    <div className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-[#050505] px-6">
      {bg.stages.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={i === 0 || i === bg.stages.length - 1 ? "high" : "low"}
          decoding="async"
          onLoad={() =>
            setDone((d) => {
              const c = [...d];
              c[i] = true;
              return c;
            })
          }
          className={
            "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " +
            (i === 0 ? "scale-110 blur-2xl " : "") +
            (done[i] ? "opacity-100" : "opacity-0")
          }
        />
      ))}

      {/* Card — paints immediately on the dark bg, before any image */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 rounded-2xl border border-white/10 bg-white/10 px-8 py-5 backdrop-blur-[10px]"
      >
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          coming soon...
        </h1>
      </motion.div>

      {/* Subtle Unsplash attribution (required by their API guidelines) */}
      {bg.name && bg.profile && (
        <a
          href={`${bg.profile}?utm_source=filzy&utm_medium=referral`}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-3 right-4 z-10 text-[11px] text-white/40 transition-colors hover:text-white/70"
        >
          {bg.name} · Unsplash
        </a>
      )}
    </div>
  );
}
