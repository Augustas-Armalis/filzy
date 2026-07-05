import { withUtm } from "@/lib/unsplash";

/*
  Unsplash attribution credit, required by the API Guidelines: every displayed
  photo must credit the photographer and Unsplash, with UTM-tagged links back to
  both profiles. Geist medium, -4% tracking, 14px (matching "Powered by
  Contles"), white at 80% opacity brightening to 100% on hover. z-0 keeps both
  credits behind the content boxes (<main> is z-10) while still above the
  full-bleed background photo.

  Desktop: bottom-right (opposite "Powered by Contles" bottom-left).
  Mobile:  a full-width, centered strip pinned to the very bottom. Full width +
  text-center + wrapping means a long "Photo by Name on Unsplash" credit stays
  inside the viewport instead of overflowing and clipping at the screen edges.
  <PoweredBy> sits just above it (bottom-[38px]) so the two 14px credits read as
  one tight block.

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
      className="fixed bottom-[14px] left-0 right-0 z-0 px-4 text-center text-[14px] leading-snug tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-100 lg:bottom-4 lg:left-auto lg:right-4 lg:px-0 lg:text-right"
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
