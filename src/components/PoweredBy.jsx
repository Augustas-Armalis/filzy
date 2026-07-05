/*
  "Powered by Contles" credit. Geist medium, -4% tracking, 14px, white at 80%
  opacity, smoothly brightening to 100% on hover. Links to contles.com (ref=filzy).
  Desktop: bottom-left. Mobile: centered near the bottom at bottom-[38px] —
  a tight ~24px gap above the Unsplash attribution so the two 14px credits read
  as one small block. z-0 keeps both credits behind the content boxes
  (<main> is z-10) while still sitting above the full-bleed background photo.
*/
export function PoweredBy() {
  return (
    <a
      href="https://contles.com/?ref=filzy"
      target="_blank"
      rel="noreferrer"
      style={{ fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: "-0.04em" }}
      className="fixed bottom-[38px] left-1/2 z-0 -translate-x-1/2 cursor-pointer text-[14px] tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-100 lg:bottom-4 lg:left-4 lg:translate-x-0"
    >
      Powered by <span className="underline">Contles</span>
    </a>
  );
}
