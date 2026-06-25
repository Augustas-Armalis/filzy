import { motion } from "framer-motion";
import { fadeInUp, viewportOnce } from "@/lib/motion";

/*
  Reveal — fades + slides its children up when they scroll into view.
  A thin wrapper around Framer Motion so you don't repeat the boilerplate.

    <Reveal delay={0.1}>
      <h2>Heading</h2>
    </Reveal>
*/
export function Reveal({ children, className, delay = 0, variants = fadeInUp }) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}
