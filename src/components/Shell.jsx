import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { UnsplashBackground } from "@/components/UnsplashBackground";
import { Navbar } from "@/components/Navbar";
import { PoweredBy } from "@/components/PoweredBy";
import { Attribution } from "@/components/Attribution";

/*
  App shell shared by every page: the switching Unsplash background, the top
  navbar (logo + nav frame), the "Powered by Contles" credit, and the required
  Unsplash photo attribution. The routed page renders into the content area and
  controls its own layout. Grows with content (page scrolls, background
  stretches) — no empty space.

  The background hands the chosen photo up via onPhoto so <Attribution> can
  credit the photographer.
*/
export function Shell({ children }) {
  const [photo, setPhoto] = useState(null);
  const location = useLocation();
  const [backgroundKey, setBackgroundKey] = useState(location.pathname);

  useEffect(() => {
    if (backgroundKey === location.pathname) return undefined;
    const timeout = window.setTimeout(() => setBackgroundKey(location.pathname), 250);
    return () => window.clearTimeout(timeout);
  }, [backgroundKey, location.pathname]);

  return (
    <div className="relative flex min-h-[100svh] w-full flex-col bg-[#050505]">
      <UnsplashBackground onPhoto={setPhoto} sceneKey={backgroundKey} />
      <Navbar />
      <PoweredBy />
      <Attribution photo={photo} />
      {/*
        pointer-events-none lets clicks in the empty areas of <main> fall through
        to the credits behind it (z-0); each page re-enables its actual cards with
        [&>*]:pointer-events-auto so the content stays fully interactive.
      */}
      <main className="filzy-main pointer-events-none relative z-10 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
