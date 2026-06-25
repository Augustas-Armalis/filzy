# Filzy

A minimal **React + Vite + Tailwind CSS v4 + Framer Motion** starter that auto-deploys to **GitHub Pages**.

Two pages with navigation, one example component, a color-token theme, and a couple of demos — that's it. Build from here.

## Quick start

```bash
npm install      # install dependencies
npm run dev      # dev server → http://localhost:5173
npm run build    # production build → ./dist
npm run preview  # preview the build locally
```

## Structure

```
index.html                 # entry + Inter font
vite.config.js             # Vite + React + Tailwind, @/ alias
public/.nojekyll           # don't run Jekyll on Pages
.github/workflows/deploy.yml  # auto-deploy to GitHub Pages on push to main
src/
  main.jsx                 # React entry
  index.css                # 🎨 color tokens (CSS variables) + Tailwind setup
  App.jsx                  # routes (HashRouter)
  components/
    Layout.jsx             # header nav + page outlet
    Button.jsx             # the example component
  pages/
    Home.jsx               # color showcase + custom Tailwind + Framer Motion
    About.jsx              # second page (navigation demo)
```

## Theming

All colors are CSS variables in [src/index.css](src/index.css), wired into Tailwind via `@theme inline`. Change one value and the whole app updates:

```css
:root {
  --primary: #7c3aed;
  --accent: #06b6d4;
  --foreground: #18181b;
  /* … */
}
```

Use them as utilities anywhere: `bg-primary`, `text-foreground`, `border-border`. (No dark mode — light only.)

## Routing

Uses `HashRouter`, so client-side routing **just works on GitHub Pages** with no server config (URLs look like `filzy.site/#/about`). Add pages in [src/App.jsx](src/App.jsx).

> Want clean URLs (`filzy.site/about`)? Swap `HashRouter` for `BrowserRouter` and add the standard GitHub Pages `404.html` SPA redirect.

## Deploy to GitHub Pages

Fully automatic. On every push to `main`, the [workflow](.github/workflows/deploy.yml)
builds the site, turns on GitHub Pages (source = "GitHub Actions") if it isn't
already, and publishes — no manual Settings change needed.

Live URL: **https://augustas-armalis.github.io/filzy/**

(The build uses a relative base + `HashRouter`, so it works at that project URL
and at a root custom domain without any extra config.)

### Optional: custom domain (filzy.site)

`filzy.site` currently has **no DNS configured**, so it points nowhere. To use it:

1. At your domain host, add apex `A` records for `filzy.site` →
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (optionally a `CNAME` record `www` → `augustas-armalis.github.io`).
2. Add a file `public/CNAME` containing `filzy.site` and push.
3. Repo **Settings → Pages → Custom domain** → enter `filzy.site`, then enable
   **Enforce HTTPS** once it verifies.

Until DNS is set up, use the github.io URL above.
