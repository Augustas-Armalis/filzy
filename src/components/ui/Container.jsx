import { cn } from "@/lib/cn";

/*
  Container — centers content and applies consistent horizontal padding.
  Use it to wrap the inner content of every section.
*/
export function Container({ className, ...props }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-6 lg:px-8", className)}
      {...props}
    />
  );
}
