import { motion } from "framer-motion";
import { Button } from "@/components/Button";

// The color tokens from src/index.css, shown as swatches.
const colors = [
  { name: "background", className: "bg-background", outline: true },
  { name: "foreground", className: "bg-foreground" },
  { name: "primary", className: "bg-primary" },
  { name: "muted", className: "bg-muted" },
  { name: "muted-foreground", className: "bg-muted-foreground" },
  { name: "border", className: "bg-border" },
];

// Framer Motion: a container that staggers its children in.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/* Heading — animates in on load */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl font-extrabold tracking-tight"
      >
        Filzy starter
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mt-3 text-muted-foreground"
      >
        React + Tailwind + Framer Motion. Start editing{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
          src/pages/Home.jsx
        </code>
        .
      </motion.p>

      {/* Colors */}
      <h2 className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Colors (edit them in src/index.css)
      </h2>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {colors.map((c) => (
          <motion.div
            key={c.name}
            variants={item}
            className="rounded-xl border border-border p-3"
          >
            <div
              className={`h-14 w-full rounded-lg ${c.className} ${
                c.outline ? "border border-border" : ""
              }`}
            />
            <div className="mt-2 text-sm font-medium">{c.name}</div>
            <div className="text-xs text-muted-foreground">{c.className}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Custom Tailwind values */}
      <h2 className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Custom Tailwind values
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="rounded-[20px] border border-border bg-muted px-[22px] py-[14px] text-[13px] font-medium">
          rounded-[20px] · px-[22px] · text-[13px]
        </div>
        <div className="rounded-[20px] bg-foreground px-[22px] py-[14px] text-[13px] font-medium text-background">
          inverted
        </div>
      </div>

      {/* Example component + navigation */}
      <h2 className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Example component & navigation
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button to="/about">Go to About →</Button>
      </div>
    </div>
  );
}
