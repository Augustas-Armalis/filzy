import { withUtm } from "@/lib/unsplash";

/*
  Unsplash attribution credit, required by the API Guidelines: every displayed
  photo must credit the photographer and Unsplash, with UTM-tagged links back to
  both profiles. Geist medium, -4% tracking, 16px (2px larger than "Powered by
  Contles"), white at 80% opacity brightening to 100% on hover. z-20 keeps the
  links clickable above <main> (z-10).

  Desktop: bottom-right (opposite "Powered by Contles" bottom-left).
  Mobile:  a full-width, centered strip pinned to the very bottom. Full width +
  text-center + wrapping means a long "Photo by Name on Unsplash" credit stays
  inside the viewport instead of overflowing and clipping at the screen edges.
  <PoweredBy> sits well above it (bottom-[62px]) so a two-line credit can't
  overlap the "Powered by Contles" line.

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
      className="fixed bottom-[14px] left-0 right-0 z-20 px-4 text-center text-[16px] leading-snug tracking-[-0.04em] text-white opacity-80 transition-opacity duration-200 hover:opacity-100 lg:bottom-4 lg:left-auto lg:right-4 lg:px-0 lg:text-right"
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
