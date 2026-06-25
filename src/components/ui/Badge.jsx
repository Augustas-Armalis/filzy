import { cn } from "@/lib/cn";

/*
  Badge — small status / label pill.
  variant: "default" | "primary" | "outline" | "success"
*/

const variants = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  outline: "border border-border text-foreground",
  success: "bg-success/15 text-success",
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
