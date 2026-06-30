import { withUtm } from "@/lib/unsplash";

/*
  Unsplash attribution credit, required by the API Guidelines: every displayed
  photo must credit the photographer and Unsplash, with UTM-tagged links back to
  both profiles. Mirrors <PoweredBy>: Geist medium, -4% tracking, 14px, white at
  80% opacity brightening to 100% on hover. z-20 keeps the links clickable above
  <main> (z-10).

  Desktop: bottom-right (opposite "Powered by Contles" bottom-left).
  Mobile:  centered along the bottom, sitting just below "Powered by Contles".

  When the photographer is known (API photo) we show the full
  "Photo by Name on Unsplash" credit; for the keyless first-load fallback the
  photographer is unknown, so we credit Unsplash alone.
*/
export function Attribution({ photo }) {
  if (!photo) return null;

  const unsplash = (
    <a
      href={withUtm("https://unsplash.com/")}
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Unsplash
    </a>
  );

  return (
    <div
      style={{ fontFamily: "'Geist', system-ui, sans-serif", letterSpacing: "-0.04em" }}
      className="fixed bottom-[10px] left-1/2 z-20 -translate-x-1/2 text-[14px] tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-100 lg:bottom-4 lg:left-auto lg:right-4 lg:translate-x-0"
    >
      {photo.name && photo.profile ? (
        <>
          Photo by{" "}
          <a
            href={withUtm(photo.profile)}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {photo.name}
          </a>{" "}
          on {unsplash}
        </>
      ) : (
        <>Photo on {unsplash}</>
      )}
    </div>
  );
}
