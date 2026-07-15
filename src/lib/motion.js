// Shared framer-motion presets — Filzy's signature blur-fade transitions, in one
// place so every page animates identically. Mirrors the presets originally
// inlined in Home.jsx (swap / fade / phaseSwap).

// Blur-fade for swapping content in place (label/tab/panel changes): old fades
// out, new fades in.
export const swap = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(12px)" },
  transition: { duration: 0.4, ease: "easeInOut" },
};

// Fast, instant-start blur-fade for empty⇄filled swaps (no out-then-in wait).
export const fade = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  transition: { duration: 0.2, ease: "easeOut" },
};

// Blur-fade between major phases. transitionEnd clears the filter so it doesn't
// break a card's backdrop-blur at rest.
export const phaseSwap = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: { opacity: 0, filter: "blur(12px)" },
  transition: { duration: 0.3, ease: "easeInOut" },
};

// Per-row enter/exit for lists (files, links, results).
export const row = {
  layout: true,
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(8px)" },
  transition: { duration: 0.22, ease: "easeOut" },
};
