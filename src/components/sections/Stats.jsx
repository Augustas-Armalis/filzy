import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { staggerContainer, fadeInUp, viewportOnce } from "@/lib/motion";
import { stats } from "@/data/content";

export function Stats() {
  return (
    <section id="stats" className="border-y border-border bg-muted/40 py-16">
      <Container>
        <motion.dl
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          className="grid grid-cols-2 gap-8 md:grid-cols-4"
        >
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeInUp}
              className="flex flex-col items-center text-center"
            >
              <dd className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                <span className="text-gradient">{stat.value}</span>
                <span className="text-gradient">{stat.suffix}</span>
              </dd>
              <dt className="mt-2 text-sm text-muted-foreground">{stat.label}</dt>
            </motion.div>
          ))}
        </motion.dl>
      </Container>
    </section>
  );
}
