# Filzy

A fast, modern front-end starter — **React + Vite + Tailwind CSS v4 + Framer Motion** — pre-wired to deploy on **GitHub Pages** at [filzy.site](https://filzy.site).

Clone it, run `npm run dev`, and start building. Push to `main` and it deploys itself.

---

## Quick start

```bash
npm install      # install dependencies (already done if you cloned with node_modules)
npm run dev      # start the dev server → http://localhost:5173
npm run build    # production build → ./dist
npm run preview  # preview the production build locally
```

That's it. Open [src/App.jsx](src/App.jsx) and start editing — changes hot-reload instantly.

---

## Project structure

```
.
├─ index.html                 # HTML entry + fonts + no-flash theme script
├─ vite.config.js             # Vite + React + Tailwind plugins, @/ alias
├─ public/
│  ├─ CNAME                   # custom domain for GitHub Pages (filzy.site)
│  ├─ .nojekyll               # tell Pages not to run Jekyll
│  └─ favicon.svg
├─ .github/workflows/
│  └─ deploy.yml              # auto-deploy to GitHub Pages on push to main
└─ src/
   ├─ main.jsx                # React entry
   ├─ index.css               # 🎨 design tokens (CSS variables) + Tailwind setup
   ├─ App.jsx                 # page composition — edit your homepage here
   ├─ data/content.js         # all placeholder copy (edit text in one place)
   ├─ lib/
   │  ├─ cn.js                # className merge helper
   │  └─ motion.js            # shared Framer Motion variants
   └─ components/
      ├─ ThemeProvider.jsx    # light/dark context
      ├─ ThemeToggle.jsx
      ├─ Logo.jsx
      ├─ ui/                  # owned components: Button, Card, Badge, Container, Reveal
      ├─ layout/              # Navbar, Footer
      └─ sections/            # Hero, Stats, Features, Showcase, CTA
```

---

## Theming (custom CSS root values)

All colors live as CSS variables in [src/index.css](src/index.css), under `:root` (light) and `.dark` (dark). Change a value once and the whole app re-themes.

```css
:root {
  --primary: oklch(0.55 0.23 287); /* your brand color */
  --background: oklch(0.99 0.002 285);
  --foreground: oklch(0.18 0.02 285);
  /* …and more */
}
```

These are wired into Tailwind via `@theme inline`, so you use them as normal utility classes:

```jsx
<div className="bg-primary text-primary-foreground border-border" />
```

**Available tokens:** `background`, `foreground`, `card`, `muted`, `primary`, `secondary`,
`accent`, `destructive`, `success`, `border`, `input`, `ring`, plus the gradient stops
`brand-from` / `brand-via` / `brand-to` and the `text-gradient` utility.

Want a new component that follows the theme? Use the tokens above — it'll match light/dark automatically.

---

## Components you own

Small, dependency-light, and fully editable in [src/components/ui/](src/components/ui/):

```jsx
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

<Button variant="primary" size="lg">Click me</Button>
<Badge variant="success">Live</Badge>
```

See them all live in the **Components** section of the homepage.

---

## Deploying to GitHub Pages (filzy.site)

Deployment is automatic via GitHub Actions. One-time setup:

1. **Push this repo to GitHub** (branch `main`).
2. In the repo, go to **Settings → Pages → Build and deployment** and set **Source = GitHub Actions**.
3. Push to `main`. The [deploy workflow](.github/workflows/deploy.yml) builds and publishes `dist/`.
4. **Custom domain:** the [public/CNAME](public/CNAME) file already contains `filzy.site`. At your DNS provider, point the domain at GitHub Pages:
   - `A` records for the apex `filzy.site` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - or a `CNAME` for `www` → `<your-github-username>.github.io`
5. Back in **Settings → Pages**, confirm the custom domain shows `filzy.site` and enable **Enforce HTTPS**.

> Using a custom domain, the site is served from the root, so `base` in `vite.config.js` is `"/"`.
> If you ever drop the custom domain and serve from `https://<user>.github.io/filzy/`, change `base` to `"/filzy/"`.

---

## Tech

- [React 19](https://react.dev)
- [Vite](https://vite.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Framer Motion](https://www.framer.com/motion/)
- [lucide-react](https://lucide.dev) icons
