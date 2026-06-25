import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/*
  Button — a themeable, animated button.
  - Renders a <button> by default, or an <a> when given an `href`.
  - Styling comes entirely from theme tokens (see src/index.css), so it
    follows light/dark automatically.

  Props:
    variant: "primary" | "secondary" | "outline" | "ghost" | "destructive"
    size:    "sm" | "md" | "lg" | "icon"
    href:    when set, renders an anchor instead of a button
*/

const variants = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-80",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
};

const sizes = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-7 text-base gap-2",
  icon: "h-11 w-11",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  href,
  children,
  ...props
}) {
  const Comp = href ? motion.a : motion.button;

  return (
    <Comp
      href={href}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-lg font-medium",
        "ring-offset-2 ring-offset-background transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
