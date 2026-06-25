/*
  Background photo source.

  Endless random photos via the official Unsplash API, filtered by orientation.
  Photos are fetched 30 at a time and cached in localStorage, so:
    - the displayed photo is chosen synchronously (cache or fallback) — we NEVER
      block the page waiting on the network;
    - ~1 API call covers ~30 page loads, staying well under the rate limit;
    - a curated keyless pool is the fallback for the first-ever visit or if the
      API is offline / rate-limited, so the background never breaks.
*/

// Unsplash "Access Key" — this is the public client key (safe for the frontend,
// rate-limited). Rotate anytime at unsplash.com/oauth/applications.
const ACCESS_KEY = "2AbzPLtKUeQE_raF0SFLAVx_GIaejG6O3XJ49TgNbIA";
const API = "https://api.unsplash.com";

// Verified, beautiful keyless fallbacks (native orientation).
const FALLBACK = {
  landscape: [
    "1506905925346-21bda4d32df4", "1441974231531-c6227db76b6e", "1470071459604-3b5ec3a7fe05",
    "1472214103451-9374bd1c798e", "1469474968028-56623f02e42e", "1447752875215-b2761acb3c5d",
    "1426604966848-d7adac402bff", "1418065460487-3e41a6c84dc5", "1505765050516-f72dcac9c60e",
    "1502082553048-f009c37129b9", "1497436072909-60f360e1d4b1", "1490750967868-88aa4486c946",
    "1454372182658-c712e4c5a1db", "1439066615861-d1af74d74000", "1465146344425-f00d5f5c8f07",
    "1431794062232-2a99a5431c6c", "1511497584788-876760111969", "1441260038675-7329ab4cc264",
    "1470770841072-f978cf4d019e", "1501785888041-af3ef285b470",
  ],
  portrait: [
    "1500530855697-b586d89ba3ee", "1433086966358-54859d0ed716", "1518495973542-4542c06a5843",
    "1513836279014-a89f7a76ae86", "1439853949127-fa647821eba0", "1518531933037-91b2f5f229cc",
    "1488161628813-04466f872be2", "1492288991661-058aa541ff43", "1475113548554-5a36f1f523d6",
    "1500648767791-00dcc994a43e",
  ],
};

const cacheKey = (o) => `filzy_unsplash_${o}`;
const read = (o) => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(o)) || "[]");
  } catch {
    return [];
  }
};
const write = (o, a) => {
  try {
    localStorage.setItem(cacheKey(o), JSON.stringify(a));
  } catch {
    /* storage full / unavailable */
  }
};

export const withParams = (raw, params) =>
  raw + (raw.includes("?") ? "&" : "?") + params;

// Synchronous: one photo to show RIGHT NOW (cached API photo, else fallback).
export function takePhoto(orientation) {
  const cache = read(orientation);
  if (cache.length) {
    const photo = cache.shift();
    write(orientation, cache);
    return photo;
  }
  const ids = FALLBACK[orientation];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return { raw: `https://images.unsplash.com/photo-${id}` };
}

const COOLDOWN_KEY = "filzy_unsplash_cooldown";

// Non-blocking: top up the cache for future loads (one call returns 30 photos).
export async function refillPhotos(orientation, min = 6) {
  try {
    if (read(orientation).length >= min) return;
    // If recently rate-limited, back off and rely on the cache/fallback.
    if (Date.now() < +(localStorage.getItem(COOLDOWN_KEY) || 0)) return;
    const r = await fetch(
      `${API}/photos/random?count=30&orientation=${orientation}&content_filter=high&client_id=${ACCESS_KEY}`
    );
    if (r.status === 403 || r.status === 429) {
      try {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now() + 60 * 60 * 1000));
      } catch {
        /* ignore */
      }
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    const photos = (Array.isArray(data) ? data : [])
      .filter((p) => p?.urls?.raw)
      .map((p) => ({
        raw: p.urls.raw,
        name: p.user?.name || null,
        profile: p.user?.links?.html || null,
      }));
    if (photos.length) write(orientation, [...read(orientation), ...photos]);
  } catch {
    /* offline → the fallback covers it */
  }
}
