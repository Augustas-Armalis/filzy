# Filzy SEO and discovery system

Updated: July 15, 2026

## What this system is designed to do

Filzy now gives each real search intent a useful, canonical URL that opens the matching product state. The system is designed to make the site easy for search crawlers, social previews, users, and answer engines to understand without creating thin keyword pages or claiming capabilities that are not connected.

No technical implementation can guarantee position one. Ranking also depends on indexing, competition, trust, backlinks, branded demand, user satisfaction, site reliability, and time. The implementation removes the major technical barriers and creates a safe foundation for growth.

## Search intent to product state

| Search intent | Canonical landing | Product state |
| --- | --- | --- |
| png to svg | `/convert/png-to-svg` | PNG input and SVG output selected |
| mov to mp4 | `/convert/mov-to-mp4` | MOV input and MP4 output selected |
| wav to mp3 | `/convert/wav-to-mp3` | WAV input and MP3 output selected |
| compress video to 25mb | `/compress/video-to-25mb` | Video settings and 25 MB target selected |
| compress image to 1mb | `/compress/image-to-1mb` | Image settings and 1 MB target selected |
| youtube to mp3 | `/extract/youtube-to-mp3` | YouTube input and MP3 output selected |
| youtube to mp4 | `/extract/youtube-to-mp4` | YouTube input and MP4 output selected |
| send large files free | `/send/large-files` | Beam ready for files and folders |

Only functioning extraction providers receive indexable pages. TikTok, Instagram, Vimeo, SoundCloud, and other sources should be added to the catalog only after the resolver, stream path, product interface, and rights guidance work end to end.

## Technical architecture

- Vite generates a real `index.html` inside every indexable route directory. GitHub Pages can therefore return a `200` document containing the route's title, description, canonical, visible copy, links, and JSON-LD before React starts.
- React mirrors the same metadata during navigation and replaces the static fallback content with the interactive tool plus the same visible explanatory content.
- Unknown routes use a real `404.html` and runtime `noindex`. Netlify-style hosting is also configured to return the 404 document for unknown paths while preserving `/s/*` Beam receiver routes.
- `/s/*` receiver sessions are excluded from robots crawling and receive `noindex, nofollow` at runtime.
- The build generates a complete XML sitemap and RSS feed from the same catalog used by the product routes.
- A public IndexNow key and an explicit `npm run seo:indexnow` command can notify participating engines after a deployment.
- `llms.txt` provides a concise capability and accuracy map for systems that choose to read it. It is supporting documentation, not a guaranteed ranking signal.

## Structured data

Every generated document includes a single JSON-LD graph containing the relevant combination of:

- `Organization`
- `WebSite`
- `WebApplication`
- `HowTo`
- `Article`
- `CollectionPage`
- `ItemList`
- `BreadcrumbList`

The structured data describes visible content. It does not add fabricated reviews, ratings, prices, questions, authors, supported platforms, or format quality.

## Content system

The initial catalog contains:

- four primary tool pages;
- four Beam intent pages;
- 35 high-value, functioning conversion pages;
- ten target-size or percentage compression pages;
- four functioning YouTube extraction pages;
- a guides hub;
- 20 substantial guides covering vector tracing, formats, compression, transfer privacy, and genuine source quality.

New pages should answer a distinct user problem. Do not create hundreds of near-identical city, platform, size, or format pages only to capture query variants. Google's spam policies explicitly identify doorway abuse and scaled content made mainly to manipulate rankings.

## Deployment and indexing checklist

1. Deploy the production `dist` build and confirm the custom domain serves the nested route HTML files.
2. Rotate any previously exposed Cloudflare credentials before production infrastructure work.
3. Verify `https://filzy.site/` as a Domain property in Google Search Console.
4. Submit `https://filzy.site/sitemap.xml` in Search Console.
5. Inspect `/`, `/convert/png-to-svg`, `/compress/video-to-25mb`, `/extract/youtube-to-mp3`, and one guide. Confirm the inspected HTML and screenshot match the public page.
6. Open Bing Webmaster Tools, verify the domain, and submit the same sitemap.
7. After the new build is live, run `npm run seo:indexnow` once. The command should not be run before the public key file and new routes are deployed.
8. Validate representative pages with Google's Rich Results Test and Schema.org Validator. Structured data eligibility does not guarantee a rich result.
9. Confirm the live server returns `200` for indexable routes and `404` for unknown routes. Do not rely only on client-side rendering.
10. Watch Search Console Pages, Sitemaps, Core Web Vitals, Enhancements, and Performance reports weekly for the first eight weeks.

## Measurement plan

Track search performance by cluster, not only total clicks:

- Beam: `send`, `large file`, `between devices`, `free file transfer`.
- Convert: source-to-target format pairs.
- Compress: media type, target MB, target percentage, bitrate, and image-size intents.
- Extract: supported provider plus target format and source-quality questions.
- Guides: informational queries that assist a later tool session.

Record impressions, clicks, average position, click-through rate, landing page, tool-start rate, successful completion, cancellation, and repeat use. A page that ranks but never produces a successful task needs product or intent work, not more keywords.

## Authority and distribution

Technical SEO cannot manufacture authority. Sustainable growth should add:

- links from genuinely useful developer, design, creator, privacy, and media resources;
- launch coverage with real demonstrations of Beam, local conversion, and PNG-to-SVG controls;
- original benchmark posts comparing file size, visual quality, path counts, conversion time, and device constraints;
- concise videos and screenshots that link to the exact configured route;
- public changelogs when a new format or provider becomes genuinely available;
- branded searches and repeat usage earned by a reliable product.

Avoid paid link schemes, fake reviews, copied comparison pages, hidden content, misleading “unlimited” claims, and publishing pages for converters or providers that fail when a user arrives.

## Content cadence

A useful cadence is two strong updates per month rather than dozens of thin posts:

- one original experiment or benchmark;
- one new or materially updated guide tied to a functioning product capability;
- refresh the affected landing pages and update their `dateModified` only when the content or product actually changed;
- resubmit changed URLs through IndexNow and request Google recrawling only for important changes.

## Official implementation references

- [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google SEO guide for developers](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [IndexNow documentation](https://www.indexnow.org/documentation)
