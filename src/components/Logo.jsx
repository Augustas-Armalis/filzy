import { Link } from "react-router-dom";

/* Filzy mark in the shared navbar. */
export function Logo() {
  return (
    <Link
      to="/"
      aria-label="Filzy — home"
      className="inline-flex shrink-0 cursor-pointer rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <img
        src={`${import.meta.env.BASE_URL}branding/Filzy.svg`}
        alt="Filzy"
        className="h-[26px] w-auto"
      />
    </Link>
  );
}
