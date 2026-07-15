# Filzy

Filzy is a browser-first file toolkit built with React, Vite, Tailwind CSS, and Framer Motion.

- Beam sends files and folders between connected devices without storing a Filzy cloud copy.
- Convert handles supported image, video, audio, data, and subtitle conversions with batch controls.
- Compress targets an output size or percentage for video, images, and audio.
- Extract resolves genuine source formats for authorized YouTube media and performs compatible muxing or conversion.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

The production build is written to `dist` and deployed to GitHub Pages by [the deployment workflow](.github/workflows/deploy.yml).

## Routing and SEO

Filzy uses `BrowserRouter` and clean paths. The Vite build creates a real HTML entry point for every indexable landing page and guide, plus route-specific metadata, structured data, visible prerendered copy, a sitemap, an RSS feed, and a noindex 404 page.

Examples:

- `/convert/png-to-svg`
- `/compress/video-to-25mb`
- `/extract/youtube-to-mp3`
- `/send/large-files`
- `/blog/png-to-svg-quality-guide`

The route catalog and guide content live in [src/content/seoCatalog.js](src/content/seoCatalog.js). The implementation and post-deployment indexing checklist are documented in [docs/SEO_GROWTH_SYSTEM.md](docs/SEO_GROWTH_SYSTEM.md).

After a production deployment, `npm run seo:indexnow` submits the catalog URLs to IndexNow. Run it only after the generated pages and public IndexNow key are live.

## Main structure

```text
src/
  App.jsx                  clean routes and page transitions
  components/              shared UI, navigation, tools, and SEO content
  content/seoCatalog.js    indexable routes and editorial guides
  hooks/                   Beam host state
  lib/                     conversion, compression, Beam, extraction, and SEO logic
  pages/                   Send, Convert, Compress, Extract, Receive, and Guides
workers/
  signaling/               Beam coordination worker
  extractor/               narrow media streaming proxy
vite.config.js             app build, local proxy, and static SEO page generation
```

## Environment

Copy `.env.example` and configure only the services required for the feature you are running. Never commit Cloudflare API tokens, R2 secrets, or other account credentials.
