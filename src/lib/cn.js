import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names intelligently.
 * Combines clsx (conditional classes) with tailwind-merge (dedupes conflicting
 * Tailwind utilities, so the last one wins). Use this in every component.
 *
 * @example cn("px-2 py-1", isActive && "bg-primary", className)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
