import { useEffect, useMemo } from "react";
import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  SITE_URL,
} from "@/content/seoCatalog";

function setMeta(attr, key, content) {
  if (content == null) return;
  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", String(content));
}

function setCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).href;
}

export function pageTitle(title) {
  if (!title) return SITE_NAME;
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

export function breadcrumbJsonLd(path, name) {
  if (!path || path === "/") return null;
  const segments = path.split("/").filter(Boolean);
  const labels = {
    blog: "Guides",
    convert: "Convert",
    compress: "Compress",
    extract: "Extract",
    send: "Send",
  };
  const items = [{ "@type": "ListItem", position: 1, name: "Filzy", item: `${SITE_URL}/` }];
  segments.forEach((segment, index) => {
    const final = index === segments.length - 1;
    const itemPath = `/${segments.slice(0, index + 1).join("/")}`;
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      name: final ? name : labels[segment] || segment.replaceAll("-", " "),
      item: absoluteUrl(itemPath),
    });
  });
  return { "@type": "BreadcrumbList", itemListElement: items };
}

export function toolJsonLd({ name, description, path, steps = [] }) {
  const graph = [
    {
      "@type": "WebApplication",
      "@id": `${absoluteUrl(path)}#app`,
      name,
      description,
      url: absoluteUrl(path),
      applicationCategory: "MultimediaApplication",
      browserRequirements: "Requires JavaScript and a modern web browser",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
  const breadcrumb = breadcrumbJsonLd(path, name);
  if (breadcrumb) graph.push(breadcrumb);
  if (steps.length) {
    graph.push({
      "@type": "HowTo",
      name,
      description,
      step: steps.map((text, index) => ({ "@type": "HowToStep", position: index + 1, text })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function articleJsonLd(page) {
  const breadcrumb = breadcrumbJsonLd(page.path, page.heading);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
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
      },
      breadcrumb,
    ].filter(Boolean),
  };
}

export function collectionJsonLd(page, items = []) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: page.heading,
        description: page.description,
        url: absoluteUrl(page.path),
        mainEntity: {
          "@type": "ItemList",
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.heading,
            url: absoluteUrl(item.path),
          })),
        },
      },
      breadcrumbJsonLd(page.path, page.heading),
    ].filter(Boolean),
  };
}

export function pageJsonLd(page) {
  if (!page) return null;
  if (page.type === "article") return articleJsonLd(page);
  return toolJsonLd({ name: page.heading || page.title, description: page.description, path: page.path, steps: page.steps });
}

function withSiteEntities(jsonLdText) {
  if (!jsonLdText) return "";
  const pageData = JSON.parse(jsonLdText);
  const pageGraph = pageData?.["@graph"] || [pageData];
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
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
      ...pageGraph,
    ],
  });
}

// Runtime metadata mirrors the static HTML generated for every indexable route.
// Keeping the values identical prevents JavaScript from changing canonicals after
// a crawler has already read the initial document.
export function useSeo({
  title,
  description,
  path = "/",
  jsonLd,
  image = DEFAULT_SOCIAL_IMAGE,
  imageAlt = "Filzy file tools",
  type = "website",
  robots = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  datePublished,
  dateModified,
} = {}) {
  const jsonLdText = useMemo(() => (jsonLd ? JSON.stringify(jsonLd) : ""), [jsonLd]);
  const completeJsonLdText = useMemo(() => withSiteEntities(jsonLdText), [jsonLdText]);

  useEffect(() => {
    const fullTitle = pageTitle(title);
    const url = absoluteUrl(path);
    document.title = fullTitle;
    document.documentElement.lang = "en";

    setMeta("name", "description", description);
    setMeta("name", "robots", robots);
    setMeta("name", "googlebot", robots);
    setMeta("property", "og:type", type);
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:locale", "en_US");
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image);
    setMeta("property", "og:image:alt", imageAlt);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    setMeta("name", "twitter:image:alt", imageAlt);
    if (type === "article") {
      setMeta("property", "article:published_time", datePublished);
      setMeta("property", "article:modified_time", dateModified);
    }
    setCanonical(url);

    document.head.querySelectorAll('script[data-site-schema], script[data-seo="page"]').forEach((element) => element.remove());
    if (completeJsonLdText) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "page";
      script.textContent = completeJsonLdText;
      document.head.appendChild(script);
    }
  }, [title, description, path, completeJsonLdText, image, imageAlt, type, robots, datePublished, dateModified]);
}
