import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/*
  Public landing at "/".

  Loading strategy (fast + smooth):
  1. The "coming soon..." card paints immediately on the dark background — it
     never waits on the image.
  2. A tiny (~1KB) blurred placeholder loads near-instantly behind it.
  3. The full, sharp image — sized to the device (capped DPR, WebP via
     auto=format) — fades in over the placeholder once it's ready.

  Images come from the Unsplash CDN (keyless). New random photo each load.
*/
const UNSPLASH_IDS = [
  "1506905925346-21bda4d32df4",
  "1441974231531-c6227db76b6e",
  "1470071459604-3b5ec3a7fe05",
  "1472214103451-9374bd1c798e",
  "1469474968028-56623f02e42e",
  "1447752875215-b2761acb3c5d",
  "1426604966848-d7adac402bff",
  "1500530855697-b586d89ba3ee",
  "1418065460487-3e41a6c84dc5",
  "1505765050516-f72dcac9c60e",
  "1433086966358-54859d0ed716",
  "1518495973542-4542c06a5843",
  "1502082553048-f009c37129b9",
  "1497436072909-60f360e1d4b1",
  "1490750967868-88aa4486c946",
  "1454372182658-c712e4c5a1db",
  "1439066615861-d1af74d74000",
  "1465146344425-f00d5f5c8f07",
  "1431794062232-2a99a5431c6c",
  "1511497584788-876760111969",
  "1513836279014-a89f7a76ae86",
  "1441260038675-7329ab4cc264",
  "1470770841072-f978cf4d019e",
];

export default function ComingSoon() {
  const [cfg] = useState(() => {
    // Cap DPR at 2 and each dimension at 2560 so big/retina screens don't
    // pull huge files. auto=format serves WebP/AVIF where supported.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = (n) => Math.min(Math.round(n * dpr), 2560);
    const id = UNSPLASH_IDS[Math.floor(Math.random() * UNSPLASH_IDS.length)];
    const base = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=entropy`;
    return {
      lqip: `${base}&w=64&q=20`,
      full: `${base}&w=${cap(window.innerWidth)}&h=${cap(window.innerHeight)}&q=70`,
    };
  });
  const [lqipLoaded, setLqipLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);

  // Dark fallback (incl. mobile overscroll) so the card is readable instantly.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#070808";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-[#070808] px-6">
      {/* 1KB blurred placeholder — appears almost immediately */}
      <img
        src={cfg.lqip}
        alt=""
        aria-hidden="true"
        onLoad={() => setLqipLoaded(true)}
        className={
          "pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl transition-opacity duration-500 " +
          (lqipLoaded ? "opacity-100" : "opacity-0")
        }
      />

      {/* Full sharp, device-sized image — fades in when ready */}
      <img
        src={cfg.full}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        onLoad={() => setFullLoaded(true)}
        className={
          "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " +
          (fullLoaded ? "opacity-100" : "opacity-0")
        }
      />

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
    </div>
  );
}
