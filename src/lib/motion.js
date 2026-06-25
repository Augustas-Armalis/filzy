/*
  Shared Framer Motion variants.
  Import these in any component to keep animations consistent.

  Usage:
    <motion.div variants={fadeInUp} initial="hidden" whileInView="show" />
    <motion.ul variants={staggerContainer} initial="hidden" whileInView="show">
      <motion.li variants={fadeInUp} />
    </motion.ul>
*/

// A pleasant ease-out curve reused across the app.
export const EASE = [0.21, 0.47, 0.32, 0.98];

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

export const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE } },
};

// Parent that staggers its children's entrance.
export const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

// Default viewport config for scroll-triggered reveals.
export const viewportOnce = { once: true, margin: "-80px" };
