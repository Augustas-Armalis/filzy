import { useEffect } from "react";

/*
  Runtime <head> manager for the SPA. Sets per-page title / description /
  canonical / Open Graph / Twitter tags and injects a JSON-LD block so each tool
  (and each pre-selected format landing, e.g. "png to svg") presents correct
  metadata. HashRouter limits crawl depth today — a BrowserRouter + prerender
  migration is the follow-up for full indexing — but this gives correct titles,
  share cards, and structured data now.
*/

const SITE = "https://filzy.site";

function setMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// config: { title, description, path, jsonLd? }
export function useSeo({ title, description, path = "/", jsonLd } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} — Filzy` : "Filzy";
    const url = `${SITE}${path}`;
    document.title = fullTitle;

    setMeta("name", "description", description);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setCanonical(url);

    let script;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo", "page");
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [title, description, path, jsonLd]);
}

// Convenience: build a WebApplication JSON-LD block for a tool page.
export function toolJsonLd({ name, description, path }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: `${SITE}${path}`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}
