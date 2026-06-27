import { UnsplashBackground } from "@/components/UnsplashBackground";
import { Navbar } from "@/components/Navbar";
import { PoweredBy } from "@/components/PoweredBy";

/*
  App shell shared by every page: the switching Unsplash background, the top
  navbar (logo + nav frame), and the "Powered by Contles" credit. The routed
  page renders into the content area and controls its own layout. Grows with
  content (page scrolls, background stretches) — no empty space.
*/
export function Shell({ children }) {
  return (
    <div className="relative flex min-h-[100svh] w-full flex-col bg-[#050505]">
      <UnsplashBackground />
      <Navbar />
      <PoweredBy />
      <main className="relative z-10 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
