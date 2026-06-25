import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Check } from "lucide-react";

/*
  A living style guide. This section shows the building blocks you already
  own so you can see them working and copy them into your own pages.
*/
export function Showcase() {
  return (
    <section id="components" className="border-t border-border bg-muted/30 py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="primary" className="mb-4">
            Components
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Building blocks, already yours
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Edit the source in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
              src/components/ui
            </code>
            . Everything is driven by your theme tokens.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {/* Buttons */}
          <Reveal>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Buttons</CardTitle>
                <CardDescription>Five variants, four sizes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
              </CardContent>
            </Card>
          </Reveal>

          {/* Badges */}
          <Reveal delay={0.05}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Badges</CardTitle>
                <CardDescription>Small labels and statuses.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Badge>Default</Badge>
                <Badge variant="primary">Primary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="success">
                  <Check size={12} /> Success
                </Badge>
              </CardContent>
            </Card>
          </Reveal>

          {/* Inputs */}
          <Reveal delay={0.1}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Inputs</CardTitle>
                <CardDescription>Themed form controls.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="you@filzy.site"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                <textarea
                  rows={3}
                  placeholder="Say something…"
                  className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </CardContent>
            </Card>
          </Reveal>

          {/* Card example */}
          <Reveal delay={0.15}>
            <Card className="flex h-full flex-col justify-between bg-gradient-to-br from-brand-from/10 via-card to-brand-to/10">
              <CardHeader>
                <CardTitle>Cards</CardTitle>
                <CardDescription>
                  Surfaces for grouping content — compose freely.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm">
                  Action
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
