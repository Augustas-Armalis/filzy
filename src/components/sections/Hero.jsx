import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { staggerContainer, fadeInUp } from "@/lib/motion";
import { brand } from "@/data/content";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Aurora background — built from the --brand-* tokens */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-from/30 blur-[120px]" />
        <div className="absolute right-[5%] top-[20%] h-[360px] w-[360px] rounded-full bg-brand-to/25 blur-[100px]" />
        <div className="absolute left-[5%] top-[30%] h-[320px] w-[320px] rounded-full bg-brand-via/20 blur-[100px]" />
      </div>

      <Container className="flex flex-col items-center py-24 text-center md:py-32">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="flex max-w-3xl flex-col items-center"
        >
          <motion.div variants={fadeInUp}>
            <Badge variant="primary" className="mb-6 py-1 pl-1.5 pr-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                <Sparkles size={11} /> New
              </span>
              React + Tailwind + Motion starter
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
          >
            Build something great with{" "}
            <span className="text-gradient">{brand.name}</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground"
          >
            {brand.tagline} A clean, themeable starter wired for instant local
            dev and one-push deploys to GitHub Pages. Start editing and ship.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button href="#cta" size="lg">
              Get started
              <ArrowRight size={18} />
            </Button>
            <Button href="#components" size="lg" variant="outline">
              View components
            </Button>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={15} className="fill-current text-primary" />
              ))}
            </span>
            Loved by developers who hate boilerplate.
          </motion.div>
        </motion.div>

        {/* Floating preview card */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="mt-16 w-full max-w-3xl"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="rounded-2xl border border-border bg-card/80 p-2 shadow-2xl shadow-primary/10 backdrop-blur"
          >
            <div className="flex items-center gap-1.5 px-3 py-2">
              <span className="h-3 w-3 rounded-full bg-destructive/70" />
              <span className="h-3 w-3 rounded-full bg-[oklch(0.8_0.16_85)]" />
              <span className="h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-3 text-xs text-muted-foreground">
                {brand.domain}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl bg-gradient-to-br from-muted to-background p-8">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-from via-brand-via to-brand-to text-xl font-extrabold text-white">
                  F
                </span>
                <div className="h-3 w-40 rounded-full bg-foreground/15" />
                <div className="h-3 w-56 rounded-full bg-foreground/10" />
                <div className="mt-2 h-9 w-32 rounded-lg bg-primary" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
