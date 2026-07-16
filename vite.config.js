import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  allSeoPages,
  DEFAULT_SOCIAL_IMAGE,
  guidePages,
  PUBLISHED_DATE,
  SITE_NAME,
  SITE_URL,
} from "./src/content/seoCatalog.js";

const EXTRACT_HOSTS = ["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com", "ggpht.com", "googleusercontent.com"];

function allowedExtractTarget(value) {
  try {
    const target = new URL(value);
    return target.protocol === "https:"
      && !target.username
      && !target.password
      && (!target.port || target.port === "443")
      && EXTRACT_HOSTS.some((domain) => target.hostname === domain || target.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function extractorDevProxy() {
  return {
    name: "filzy-extractor-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/extract-proxy", async (request, response) => {
        const requestUrl = new URL(request.url || "/", "http://localhost");
        const target = requestUrl.searchParams.get("url") || "";
        if (!allowedExtractTarget(target)) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Unsupported extraction target" }));
          return;
        }

        try {
          const chunks = [];
          let bodySize = 0;
          for await (const chunk of request) {
            bodySize += chunk.length;
            if (bodySize > 2 * 1024 * 1024) throw new Error("Request body is too large");
            chunks.push(chunk);
          }
          const method = (request.method || "GET").toUpperCase();
          const headers = new Headers();
          for (const [name, value] of Object.entries(request.headers)) {
            if (!value) continue;
            const lower = name.toLowerCase();
            if (["accept", "accept-language", "content-type", "range", "user-agent", "x-origin"].includes(lower) || lower.startsWith("x-youtube-") || lower.startsWith("x-goog-")) {
              headers.set(name, Array.isArray(value) ? value.join(", ") : value);
            }
          }
          if (new URL(target).hostname.endsWith("youtube.com") && method === "POST") headers.set("origin", "https://www.youtube.com");

          const upstream = await fetch(target, {
            method,
            headers,
            body: ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks),
            redirect: "follow",
          });
          const safeHeaders = {};
          // Node's fetch transparently decompresses text responses, so never
          // forward the upstream compressed Content-Length with that body.
          for (const name of ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
            const value = upstream.headers.get(name);
            if (value) safeHeaders[name] = value;
          }
          response.writeHead(upstream.status, safeHeaders);
          if (!upstream.body) response.end();
          else Readable.fromWeb(upstream.body).pipe(response);
        } catch (error) {
          response.writeHead(502, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: error?.message || "Proxy request failed" }));
        }
      });
    },
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).href;
}

function fullTitle(page) {
  return page.title.includes(SITE_NAME) ? page.title : `${page.title} | ${SITE_NAME}`;
}

function replaceMeta(html, attribute, key, value) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${key}["'])[^>]*>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

function breadcrumbItems(page) {
  if (page.path === "/") return [];
  const segments = page.path.split("/").filter(Boolean);
  const labels = { blog: "Guides", convert: "Convert", compress: "Compress", extract: "Extract", send: "Send" };
  const items = [{ "@type": "ListItem", position: 1, name: "Filzy", item: `${SITE_URL}/` }];
  segments.forEach((segment, index) => {
    const final = index === segments.length - 1;
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      name: final ? page.heading : labels[segment] || segment.replaceAll("-", " "),
      item: absoluteUrl(`/${segments.slice(0, index + 1).join("/")}`),
    });
  });
  return items;
}

function structuredData(page) {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/branding/Filzy.svg` },
      sameAs: ["https://www.instagram.com/filzy.site/"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: "Direct file transfer, local file conversion, media compression, and source-aware media extraction.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
  ];

  if (page.type === "article") {
    graph.push({
      "@type": "Article",
      "@id": `${absoluteUrl(page.path)}#article`,
      headline: page.heading,
      description: page.description,
      datePublished: page.datePublished,
      dateModified: page.dateModified,
      mainEntityOfPage: absoluteUrl(page.path),
      image: DEFAULT_SOCIAL_IMAGE,
      author: { "@id": `${SITE_URL}/#organization` },
      publisher: { "@id": `${SITE_URL}/#organization` },
    });
  } else if (page.type === "collection") {
    graph.push({
      "@type": "CollectionPage",
      name: page.heading,
      description: page.description,
      url: absoluteUrl(page.path),
      mainEntity: {
        "@type": "ItemList",
        itemListElement: guidePages.map((guide, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: guide.heading,
          url: absoluteUrl(guide.path),
        })),
      },
    });
  } else {
    graph.push({
      "@type": "WebApplication",
      "@id": `${absoluteUrl(page.path)}#app`,
      name: page.heading,
      description: page.description,
      url: absoluteUrl(page.path),
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript and a modern web browser",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    });
    if (page.steps?.length) {
      graph.push({
        "@type": "HowTo",
        name: page.heading,
        description: page.description,
        step: page.steps.map((text, index) => ({ "@type": "HowToStep", position: index + 1, text })),
      });
    }
  }

  const breadcrumbs = breadcrumbItems(page);
  if (breadcrumbs.length) graph.push({ "@type": "BreadcrumbList", itemListElement: breadcrumbs });
  return { "@context": "https://schema.org", "@graph": graph };
}

function prerenderedContent(page) {
  const details = (page.sections || []).map((section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
          <p>${escapeHtml(section.body)}</p>
        </section>`).join("");
  const steps = page.steps?.length ? `
        <section>
          <h2>How it works</h2>
          <ol>${page.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        </section>` : "";
  const links = page.type === "collection"
    ? guidePages.map((guide) => `<li><a href="${guide.path}">${escapeHtml(guide.heading)}</a></li>`).join("")
    : (page.relatedPaths || []).map((path) => {
      const related = allSeoPages.find((candidate) => candidate.path === path);
      return related ? `<li><a href="${path}">${escapeHtml(related.heading)}</a></li>` : "";
    }).join("");

  // Crawlers read this static copy from the raw HTML, but real visitors must
  // never see it flash before React mounts and replaces #root. Rendering it in
  // a visually-hidden (screen-reader-clip) container keeps the text in the
  // document for indexing while making it invisible during the mount gap, so
  // there is no split-second unstyled "Filzy Beam / Send files" block on load.
  return `
    <div style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">
      <main>
        <p>${escapeHtml(page.eyebrow || "Filzy")}</p>
        <h1>${escapeHtml(page.heading)}</h1>
        <p>${escapeHtml(page.intro || page.description)}</p>${steps}${details}
        ${links ? `<nav aria-label="Related pages"><h2>Explore Filzy</h2><ul>${links}</ul></nav>` : ""}
      </main>
    </div>`;
}

function renderRouteHtml(template, page, { noindex = false } = {}) {
  const url = absoluteUrl(page.path);
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(fullTitle(page))}</title>`);
  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "name", "robots", noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  html = replaceMeta(html, "name", "googlebot", noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  html = replaceMeta(html, "property", "og:type", page.type === "article" ? "article" : "website");
  html = replaceMeta(html, "property", "og:title", fullTitle(page));
  html = replaceMeta(html, "property", "og:description", page.description);
  html = replaceMeta(html, "property", "og:url", url);
  html = replaceMeta(html, "property", "og:image", DEFAULT_SOCIAL_IMAGE);
  html = replaceMeta(html, "property", "og:image:alt", page.heading);
  html = replaceMeta(html, "name", "twitter:title", fullTitle(page));
  html = replaceMeta(html, "name", "twitter:description", page.description);
  html = replaceMeta(html, "name", "twitter:image", DEFAULT_SOCIAL_IMAGE);
  html = replaceMeta(html, "name", "twitter:image:alt", page.heading);
  if (page.type === "article") {
    html = replaceMeta(html, "property", "article:published_time", page.datePublished);
    html = replaceMeta(html, "property", "article:modified_time", page.dateModified);
  }
  const canonical = `<link rel="canonical" href="${url}" />`;
  html = html.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i, canonical);
  const json = JSON.stringify(structuredData(page)).replaceAll("<", "\\u003c");
  html = html.replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i, `<script type="application/ld+json" data-site-schema>${json}</script>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${prerenderedContent(page)}</div>`);
  return html;
}

function sitemapXml() {
  const urls = allSeoPages.map((page) => `  <url>\n    <loc>${escapeHtml(absoluteUrl(page.path))}</loc>\n    <lastmod>${page.dateModified || PUBLISHED_DATE}</lastmod>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function rssXml() {
  const items = guidePages.map((page) => `    <item>\n      <title>${escapeHtml(page.heading)}</title>\n      <link>${escapeHtml(absoluteUrl(page.path))}</link>\n      <guid>${escapeHtml(absoluteUrl(page.path))}</guid>\n      <pubDate>${new Date(`${page.datePublished}T00:00:00Z`).toUTCString()}</pubDate>\n      <description>${escapeHtml(page.description)}</description>\n    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n    <title>Filzy guides</title>\n    <link>${SITE_URL}/blog</link>\n    <description>Guides to file conversion, compression, transfer, and source quality.</description>\n${items}\n  </channel></rss>\n`;
}

function seoStaticPages() {
  return {
    name: "filzy-static-seo-pages",
    apply: "build",
    async writeBundle(outputOptions) {
      const outDir = outputOptions.dir || "dist";
      const template = await readFile(join(outDir, "index.html"), "utf8");

      for (const page of allSeoPages) {
        const destination = page.path === "/" ? join(outDir, "index.html") : join(outDir, page.path.slice(1), "index.html");
        await mkdir(join(destination, ".."), { recursive: true });
        await writeFile(destination, renderRouteHtml(template, page), "utf8");
      }

      const notFound = {
        path: "/not-found",
        type: "website",
        title: "Page not found",
        heading: "Page not found",
        description: "This Filzy page does not exist.",
        intro: "Return to Filzy to send, convert, compress, or extract a file.",
        relatedPaths: ["/", "/convert", "/compress", "/extract"],
      };
      const notFoundHtml = renderRouteHtml(template, notFound, { noindex: true });
      await mkdir(join(outDir, "not-found"), { recursive: true });
      await writeFile(join(outDir, "not-found", "index.html"), notFoundHtml, "utf8");
      await writeFile(join(outDir, "404.html"), notFoundHtml, "utf8");
      await writeFile(join(outDir, "sitemap.xml"), sitemapXml(), "utf8");
      await writeFile(join(outDir, "feed.xml"), rssXml(), "utf8");
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Filzy is served from the root custom domain. Absolute assets also let the
  // same built index work as GitHub Pages' clean-URL SPA fallback.
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    extractorDevProxy(),
    seoStaticPages(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
