import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/*
  Public landing at "/". A new random full-resolution Unsplash photo loads on
  every visit/reload, with a frosted-glass "coming soon..." card on top.

  Unsplash retired its keyless random endpoint (source.unsplash.com), so we use
  a curated pool of real Unsplash photo IDs served from their image CDN
  (images.unsplash.com) — no API key, and the IDs are verified to exist. The URL
  requests the photo cropped to your exact display resolution.
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
  const [src] = useState(() => {
    const id = UNSPLASH_IDS[Math.floor(Math.random() * UNSPLASH_IDS.length)];
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.screen.width * dpr);
    const h = Math.round(window.screen.height * dpr);
    return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&crop=entropy&q=85&auto=format`;
  });
  const [loaded, setLoaded] = useState(false);

  // Dark fallback (incl. mobile overscroll) while the photo loads.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#070808";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-[#070808] px-6">
      {/* Random full-res Unsplash background photo */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        onLoad={() => setLoaded(true)}
        className={
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " +
          (loaded ? "opacity-100" : "opacity-0")
        }
      />

      {/* Frosted-glass card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 rounded-2xl border border-white/10 bg-white/10 px-8 py-5 backdrop-blur-[10px]"
      >
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          coming soon...
        </h1>
      </motion.div>
    </div>
  );
}
