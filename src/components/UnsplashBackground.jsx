import { useEffect, useRef, useState } from "react";
import { takePhoto, refillPhotos, withParams, triggerDownload } from "@/lib/unsplash";

let sceneId = 0;

function makeScene() {
  const orientation = window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
  const photo = takePhoto(orientation);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cap = (value) => Math.min(Math.round(value * dpr), 2560);
  const width = cap(window.innerWidth);
  const height = cap(window.innerHeight);
  const at = (divisor, quality) => withParams(
    photo.raw,
    `fit=crop&crop=entropy&auto=format&w=${Math.max(16, Math.round(width / divisor))}&h=${Math.max(16, Math.round(height / divisor))}&q=${quality}`,
  );

  return {
    id: ++sceneId,
    orientation,
    photo,
    urls: [
      at(26, 25),
      at(3, 55),
      withParams(photo.raw, `fit=crop&crop=entropy&auto=format&w=${width}&h=${height}&q=85`),
    ],
  };
}

function PhotoScene({ scene, active, visible, onReady }) {
  const [loaded, setLoaded] = useState([false, false, false]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity duration-[900ms] ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {scene.urls.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={active && (index === 0 || index === scene.urls.length - 1) ? "high" : "low"}
          decoding="async"
          onLoad={() => {
            if (active && index >= 1) onReady(scene);
            if (active && index === scene.urls.length - 1) triggerDownload(scene.photo.downloadLocation);
            setLoaded((current) => current.map((value, itemIndex) => itemIndex === index ? true : value));
          }}
          className={
            `absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === 0 ? "scale-110 blur-2xl " : ""}${loaded[index] ? "opacity-100" : "opacity-0"}`
          }
        />
      ))}
    </div>
  );
}

/*
  Persistent full-bleed photo layer. Route changes prepare a new progressive
  image underneath the UI, then crossfade only after its medium stage is ready.
  The previous scene stays visible throughout, so navigation never flashes.
*/
export function UnsplashBackground({ onPhoto, sceneKey }) {
  const [current, setCurrent] = useState(makeScene);
  const [previous, setPrevious] = useState(null);
  const [ready, setReady] = useState(false);
  const lastKey = useRef(sceneKey);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    refillPhotos(current.orientation);
    onPhoto?.(current.photo);
  }, []); // first scene only; later attribution changes when the crossfade starts

  useEffect(() => {
    if (lastKey.current === sceneKey) return;
    lastKey.current = sceneKey;
    const next = makeScene();
    setPrevious(currentRef.current);
    setCurrent(next);
    setReady(false);
    void refillPhotos(next.orientation);
  }, [sceneKey]);

  useEffect(() => {
    if (!ready || !previous) return undefined;
    const timeout = window.setTimeout(() => setPrevious(null), 950);
    return () => window.clearTimeout(timeout);
  }, [previous, ready]);

  const markReady = (scene) => {
    if (scene.id !== currentRef.current.id) return;
    setReady(true);
    onPhoto?.(scene.photo);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-text">
      {previous && <PhotoScene key={previous.id} scene={previous} active={false} visible={!ready} onReady={() => {}} />}
      <PhotoScene key={current.id} scene={current} active visible={!previous || ready} onReady={markReady} />
    </div>
  );
}
