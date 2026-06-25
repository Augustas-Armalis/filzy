import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { fadeInUp, viewportOnce } from "@/lib/motion";

export function CTA() {
  return (
    <section id="cta" className="py-24">
      <Container>
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand-from via-brand-via to-brand-to px-6 py-16 text-center shadow-xl sm:px-16"
        >
          {/* Soft glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,white,transparent_45%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Ready to build? Start editing in seconds.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-white/80">
              Run <code className="rounded bg-white/15 px-1.5 py-0.5">npm run dev</code>,
              open the page, and start shipping. Push to deploy.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                href="https://vite.dev"
                size="lg"
                className="bg-white text-[oklch(0.25_0.05_287)] hover:opacity-90"
              >
                Read the docs
                <ArrowRight size={18} />
              </Button>
              <Button
                href="#top"
                size="lg"
                variant="outline"
                className="border-white/40 text-white hover:bg-white/10"
              >
                Back to top
              </Button>
            </div>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
