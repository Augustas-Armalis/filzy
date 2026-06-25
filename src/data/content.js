/*
  All the placeholder copy for the homepage lives here so the page stays
  data-driven. Swap these out for your real content — the layout reacts
  automatically.
*/

import { Zap, Shield, Palette, Rocket, Code2, Sparkles } from "lucide-react";

export const brand = {
  name: "Filzy",
  domain: "filzy.site",
  tagline: "The starter that gets out of your way.",
};

export const nav = [
  { label: "Features", href: "#features" },
  { label: "Components", href: "#components" },
  { label: "Stats", href: "#stats" },
  { label: "Get started", href: "#cta" },
];

export const features = [
  {
    icon: Zap,
    title: "Blazing fast",
    description:
      "Powered by Vite. Instant dev server, lightning hot-module reloads, and an optimized production build.",
  },
  {
    icon: Palette,
    title: "Themeable tokens",
    description:
      "Every color is a CSS variable in :root. Change a few values and the entire app re-themes — light and dark.",
  },
  {
    icon: Sparkles,
    title: "Motion built in",
    description:
      "Framer Motion is wired up with reusable variants for smooth entrances, hovers, and page transitions.",
  },
  {
    icon: Code2,
    title: "Owned components",
    description:
      "A small set of clean, accessible React components you fully own. No black boxes — just edit the source.",
  },
  {
    icon: Shield,
    title: "Type-safe paths",
    description:
      "Import with the @/ alias from anywhere. Sensible structure that scales from a landing page to an app.",
  },
  {
    icon: Rocket,
    title: "Ship to Pages",
    description:
      "A GitHub Actions workflow deploys to GitHub Pages on every push. Custom domain already configured.",
  },
];

export const stats = [
  { value: "100", suffix: "%", label: "Lighthouse-ready" },
  { value: "0", suffix: "ms", label: "Config to start" },
  { value: "6", suffix: "+", label: "UI components" },
  { value: "∞", suffix: "", label: "Possibilities" },
];

export const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Components", href: "#components" },
      { label: "Get started", href: "#cta" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "React", href: "https://react.dev" },
      { label: "Tailwind CSS", href: "https://tailwindcss.com" },
      { label: "Framer Motion", href: "https://www.framer.com/motion/" },
    ],
  },
  {
    title: "Deploy",
    links: [
      { label: "Vite", href: "https://vite.dev" },
      { label: "GitHub Pages", href: "https://pages.github.com" },
    ],
  },
];
