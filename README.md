# Filzy

A minimal **React + Vite + Tailwind CSS v4 + Framer Motion** starter, ready to deploy on **GitHub Pages** at [filzy.site](https://filzy.site).

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
public/CNAME               # custom domain (filzy.site)
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

## Deploy to GitHub Pages (filzy.site)

1. Push to GitHub (branch `main`).
2. Repo **Settings → Pages → Source = "GitHub Actions"**.
3. Point DNS for `filzy.site` at GitHub: apex `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
4. Confirm the custom domain ([public/CNAME](public/CNAME) already has `filzy.site`) and enable **Enforce HTTPS**.

Every push to `main` rebuilds and redeploys automatically.
