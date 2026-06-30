import { useState } from "react";
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

  return (
    <div className="relative flex min-h-[100svh] w-full flex-col bg-[#050505]">
      <UnsplashBackground onPhoto={setPhoto} />
      <Navbar />
      <PoweredBy />
      <Attribution photo={photo} />
      <main className="relative z-10 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
