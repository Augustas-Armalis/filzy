import { ThemeProvider } from "@/components/ThemeProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { Stats } from "@/components/sections/Stats";
import { Features } from "@/components/sections/Features";
import { Showcase } from "@/components/sections/Showcase";
import { CTA } from "@/components/sections/CTA";

export default function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex-1">
          {/*
            This is your homepage. Each section is a self-contained component
            under src/components/sections — add, remove, or reorder freely.
          */}
          <Hero />
          <Stats />
          <Features />
          <Showcase />
          <CTA />
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}
