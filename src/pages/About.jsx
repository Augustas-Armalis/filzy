import { motion } from "framer-motion";
import { Button } from "@/components/Button";

// A second page — here purely to demonstrate navigation between routes.
export default function About() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-6 py-16"
    >
      <h1 className="text-4xl font-extrabold tracking-tight">About</h1>
      <p className="mt-3 text-muted-foreground">
        This is a second page, wired up with the navigation in the header. Add
        your own routes in{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">src/App.jsx</code>
        . Edit this page in{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
          src/pages/About.jsx
        </code>
        .
      </p>
      <div className="mt-8">
        <Button to="/" variant="outline">
          ← Back home
        </Button>
      </div>
    </motion.div>
  );
}
