import { Shell } from "@/components/Shell";

/*
  Layout for the tool pages (Convert / Compress / Extract). Same full-bleed
  switching Unsplash background + navbar + credits as the home/beam page — the
  tool card floats over it, centered. Kept as its own component so the tool
  pages have one obvious wrapper (and so we can evolve their layout later
  without touching every page).
*/
export function ToolShell({ children }) {
  return (
    <Shell>
      <div className="flex flex-1 items-start justify-center px-[10px] pt-[64px] pb-[72px] [&>*]:pointer-events-auto sm:items-center lg:pt-[64px]">
        {children}
      </div>
    </Shell>
  );
}
