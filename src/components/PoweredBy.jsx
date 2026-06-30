/*
  "Powered by Contles" credit. Geist medium, -4% tracking, 14px, white at 80%
  opacity, smoothly brightening to 100% on hover. Links to contles.com (ref=filzy).
  Desktop: bottom-left. Mobile: centered along the bottom, sitting just above the
  Unsplash attribution. z-20 keeps it above the full-viewport <main> (z-10) so it
  stays clickable.
*/
export function PoweredBy() {
  return (
    <a
      href="https://contles.com/?ref=filzy"
      target="_blank"
      rel="noreferrer"
      style={{ fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: "-0.04em" }}
      className="fixed bottom-[34px] left-1/2 z-20 -translate-x-1/2 cursor-pointer text-[14px] tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-100 lg:bottom-4 lg:left-4 lg:translate-x-0"
    >
      Powered by <span className="underline">Contles</span>
    </a>
  );
}
