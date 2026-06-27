/* Keep the hosting tab awake while a beam is live — your device is the server,
   so letting the screen sleep would stall transfers. Browsers release the lock
   when the tab is hidden, so we re-acquire on visibilitychange. No-ops where the
   Wake Lock API is unavailable (the UI copy stays honest about that). */

let wakeLock = null;
let active = false;
let listening = false;

async function acquire() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => {
        wakeLock = null;
      });
    }
  } catch {
    /* user agent may reject (e.g. tab not visible) — handled by re-acquire */
  }
}

function onVisibility() {
  if (active && document.visibilityState === "visible" && !wakeLock) void acquire();
}

export async function preventSleep() {
  active = true;
  if (!listening) {
    document.addEventListener("visibilitychange", onVisibility);
    listening = true;
  }
  await acquire();
}

export async function allowSleep() {
  active = false;
  if (listening) {
    document.removeEventListener("visibilitychange", onVisibility);
    listening = false;
  }
  try {
    await wakeLock?.release();
  } catch {
    /* noop */
  }
  wakeLock = null;
}
