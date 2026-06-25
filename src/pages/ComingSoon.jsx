import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/*
  Public landing at "/".

  Background: a random, beautiful Unsplash photo (real images.unsplash.com,
  keyless). Photos are grouped by native orientation so phones get PORTRAIT
  shots and larger screens get LANDSCAPE ones — no awkward crops. A no-repeat
  picker cycles through the whole pool before any photo shows again.

  Loading is progressive and sized to the device (DPR capped, WebP via
  auto=format): super-low blurred placeholder → mid → full premium quality.
  The "coming soon..." card paints immediately and never waits on the image.
*/
const LANDSCAPE_IDS = [
  "1506905925346-21bda4d32df4", "1441974231531-c6227db76b6e", "1470071459604-3b5ec3a7fe05",
  "1472214103451-9374bd1c798e", "1469474968028-56623f02e42e", "1447752875215-b2761acb3c5d",
  "1426604966848-d7adac402bff", "1418065460487-3e41a6c84dc5", "1505765050516-f72dcac9c60e",
  "1502082553048-f009c37129b9", "1497436072909-60f360e1d4b1", "1490750967868-88aa4486c946",
  "1454372182658-c712e4c5a1db", "1439066615861-d1af74d74000", "1465146344425-f00d5f5c8f07",
  "1431794062232-2a99a5431c6c", "1511497584788-876760111969", "1441260038675-7329ab4cc264",
  "1470770841072-f978cf4d019e", "1501785888041-af3ef285b470", "1470115636492-6d2b56f9146d",
  "1493246507139-91e8fad9978e", "1454496522488-7a8e488e8606", "1476610182048-b716b8518aae",
  "1500534623283-312aade485b7", "1444723121867-7a241cacace9", "1519681393784-d120267933ba",
  "1454942901704-3c44c11b2ad1", "1483728642387-6c3bdd6c93e5", "1470770903676-69b98201ea1c",
];

const PORTRAIT_IDS = [
  "1500530855697-b586d89ba3ee", "1433086966358-54859d0ed716", "1518495973542-4542c06a5843",
  "1513836279014-a89f7a76ae86", "1439853949127-fa647821eba0", "1518531933037-91b2f5f229cc",
  "1488161628813-04466f872be2", "1492288991661-058aa541ff43", "1475113548554-5a36f1f523d6",
  "1500648767791-00dcc994a43e",
];

// Pick a random id that hasn't shown recently — cycles the whole pool first.
function pickNoRepeat(pool, key) {
  try {
    let recent = JSON.parse(localStorage.getItem(key) || "[]");
    let avail = pool.filter((id) => !recent.includes(id));
    if (!avail.length) avail = pool;
    const id = avail[Math.floor(Math.random() * avail.length)];
    recent = [...recent.filter((x) => x !== id), id].slice(-(pool.length - 1));
    localStorage.setItem(key, JSON.stringify(recent));
    return id;
  } catch {
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

export default function ComingSoon() {
  const [stages] = useState(() => {
    const portrait = window.innerHeight >= window.innerWidth;
    const id = portrait
      ? pickNoRepeat(PORTRAIT_IDS, "filzy_seen_p")
      : pickNoRepeat(LANDSCAPE_IDS, "filzy_seen_l");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = (n) => Math.min(Math.round(n * dpr), 2560);
    const w = cap(window.innerWidth);
    const h = cap(window.innerHeight);
    const base = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=entropy`;
    const at = (div, q) =>
      `${base}&w=${Math.max(16, Math.round(w / div))}&h=${Math.max(16, Math.round(h / div))}&q=${q}`;
    return [
      at(26, 25), // super-low, blurred placeholder (~1KB)
      at(3, 55), // mid quality
      `${base}&w=${w}&h=${h}&q=85`, // full, premium quality
    ];
  });

  const [done, setDone] = useState(() => stages.map(() => false));

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#070808";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-[#070808] px-6">
      {stages.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={i === stages.length - 1 ? "high" : "low"}
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
    </div>
  );
}
