import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

// Animated version of react-router's Link, for internal navigation buttons.
const MotionLink = motion.create(Link);

/*
  Button — the example component.
  - <button> by default
  - pass `to` for in-app navigation (e.g. to="/about")
  - pass `href` for external links
  Styling uses the theme tokens, and Framer Motion adds a little tap feedback.
*/
const variants = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-muted",
};

export function Button({
  className,
  variant = "primary",
  to,
  href,
  children,
  ...props
}) {
  let Comp = motion.button;
  const linkProps = {};
  if (to) {
    Comp = MotionLink;
    linkProps.to = to;
  } else if (href) {
    Comp = motion.a;
    linkProps.href = href;
  }

  return (
    <Comp
      {...linkProps}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "inline-flex h-11 select-none items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
