import { useEffect, useState } from "react";
import { takePhoto, refillPhotos, withParams, triggerDownload } from "@/lib/unsplash";

/*
  Full-bleed background photo, loaded progressively (blur → mid → full premium).
  Sits behind everything; stretches to cover the page (object-cover) even when
  the content makes the page taller than the viewport — no empty space.
  Random Unsplash photo per load, portrait on mobile / landscape on desktop.
*/
export function UnsplashBackground({ onPhoto }) {
  const [stages] = useState(() => {
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
      photo,
      urls: [
        at(26, 25), // super-low blurred placeholder (~1KB)
        at(3, 55), // mid quality
        withParams(
          photo.raw,
          `fit=crop&crop=entropy&auto=format&w=${w}&h=${h}&q=85`
        ), // full, premium
      ],
    };
  });

  const [done, setDone] = useState([false, false, false]);

  useEffect(() => {
    refillPhotos(stages.orientation); // top up the endless pool for next loads
    onPhoto?.(stages.photo); // hand the photo up so it can be attributed
  }, [stages.orientation, stages.photo, onPhoto]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {stages.urls.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={i === 0 || i === stages.urls.length - 1 ? "high" : "low"}
          decoding="async"
          onLoad={() => {
            // The full-res stage finished → the photo is genuinely "used".
            if (i === stages.urls.length - 1)
              triggerDownload(stages.photo.downloadLocation);
            setDone((d) => {
              const c = [...d];
              c[i] = true;
              return c;
            });
          }}
          className={
            "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " +
            (i === 0 ? "scale-110 blur-2xl " : "") +
            (done[i] ? "opacity-100" : "opacity-0")
          }
        />
      ))}
    </div>
  );
}
