import { cn } from "@/lib/cn";
import { brand } from "@/data/content";

/*
  Logo — the gradient "F" mark plus the wordmark.
  Pass `showText={false}` to render just the mark.
*/
export function Logo({ className, showText = true }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-from via-brand-via to-brand-to text-base font-extrabold text-white shadow-sm">
        F
      </span>
      {showText && (
        <span className="text-lg font-bold tracking-tight">{brand.name}</span>
      )}
    </span>
  );
}
