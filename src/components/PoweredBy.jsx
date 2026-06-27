/*
  "Powered by Contles" credit. Geist medium, -4% tracking, 14px, white at 80%
  opacity, smoothly dimming to 50% on hover. Links to contles.com (ref=filzy).
  Desktop: bottom-left. Mobile: centered along the bottom.
*/
export function PoweredBy() {
  return (
    <a
      href="https://contles.com/?ref=filzy"
      target="_blank"
      rel="noreferrer"
      style={{ fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: "-0.04em" }}
      className="fixed bottom-[10px] left-1/2 z-20 -translate-x-1/2 cursor-pointer text-[12px] tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-50 lg:bottom-4 lg:left-4 lg:translate-x-0"
    >
      Powered by <span className="underline">Contles</span>
    </a>
  );
}
