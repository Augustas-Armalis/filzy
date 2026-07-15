import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { relatedPagesFor } from "@/content/seoCatalog";

function RelatedLinks({ page }) {
  const related = relatedPagesFor(page);
  if (!related.length) return null;
  return (
    <nav aria-label="Related Filzy pages" className="border-t border-border pt-[18px]">
      <h2 className="text-[16px] text-text">Keep exploring</h2>
      <div className="mt-[10px] grid gap-[6px] sm:grid-cols-2 lg:grid-cols-3">
        {related.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="group flex min-h-[44px] items-center justify-between gap-[8px] rounded-[10px] border border-border bg-bg px-[11px] py-[8px] text-[12px] text-alt-text transition-colors hover:bg-bg-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
          >
            <span>{item.heading || item.title}</span>
            <ArrowUpRight size={14} strokeWidth={1.17} absoluteStrokeWidth className="shrink-0 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function SeoLandingContent({ page }) {
  if (!page) return null;
  return (
    <section aria-labelledby="filzy-page-heading" className="pointer-events-auto relative z-10 mx-auto w-full max-w-[980px] px-[10px] pb-[94px] lg:px-0">
      <article className="rounded-[18px] border border-white/30 bg-white/95 p-[18px] text-text shadow-[0_20px_70px_rgba(0,0,0,0.14)] backdrop-blur-[18px] sm:p-[24px] lg:p-[30px]">
        <header className="max-w-[720px]">
          <p className="text-[10px] uppercase tracking-[0.08em] text-alt-text">{page.eyebrow}</p>
          <h1 id="filzy-page-heading" className="mt-[7px] text-[28px] leading-[1.03] tracking-[-0.05em] text-text sm:text-[36px]">{page.heading}</h1>
          <p className="mt-[12px] text-[14px] font-normal leading-[1.55] tracking-[-0.025em] text-alt-text sm:text-[15px]">{page.intro}</p>
        </header>

        {!!page.highlights?.length && (
          <ul className="mt-[20px] grid gap-[6px] sm:grid-cols-2 lg:grid-cols-4">
            {page.highlights.map((item) => (
              <li key={item} className="flex items-center gap-[7px] rounded-[10px] border border-border bg-bg px-[10px] py-[9px] text-[11px] text-alt-text">
                <Check size={13} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-text" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {!!page.steps?.length && (
          <section className="mt-[24px]">
            <h2 className="text-[16px] text-text">How it works</h2>
            <ol className="mt-[10px] grid gap-[7px] md:grid-cols-3">
              {page.steps.map((step, index) => (
                <li key={step} className="flex gap-[9px] rounded-[11px] border border-border p-[11px] text-[12px] font-normal leading-[1.45] tracking-[-0.025em] text-alt-text">
                  <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-text text-[10px] text-white">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!!page.sections?.length && (
          <div className="mt-[24px] grid gap-x-[28px] gap-y-[20px] md:grid-cols-2">
            {page.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[16px] text-text">{section.heading}</h2>
                <p className="mt-[7px] text-[13px] font-normal leading-[1.58] tracking-[-0.025em] text-alt-text">{section.body}</p>
              </section>
            ))}
          </div>
        )}

        <div className="mt-[24px]">
          <RelatedLinks page={page} />
        </div>
      </article>
    </section>
  );
}

export function ArticleContent({ page }) {
  return (
    <article className="rounded-[18px] border border-white/30 bg-white/95 p-[18px] text-text shadow-[0_20px_70px_rgba(0,0,0,0.14)] backdrop-blur-[18px] sm:p-[28px] lg:p-[38px]">
      <header className="max-w-[760px]">
        <Link to="/blog" className="text-[10px] uppercase tracking-[0.08em] text-alt-text transition-colors hover:text-text">Filzy guides / {page.eyebrow}</Link>
        <h1 className="mt-[10px] text-[32px] leading-[1.02] tracking-[-0.055em] text-text sm:text-[44px]">{page.heading}</h1>
        <p className="mt-[14px] text-[15px] font-normal leading-[1.6] tracking-[-0.025em] text-alt-text sm:text-[16px]">{page.description}</p>
        <div className="mt-[12px] flex items-center gap-[6px] text-[10px] text-dalt-text">
          <Clock3 size={12} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />
          <span>{page.readMinutes} minute read</span>
          <span aria-hidden="true">·</span>
          <time dateTime={page.dateModified}>Updated July 15, 2026</time>
        </div>
      </header>

      <div className="mt-[30px] max-w-[760px] space-y-[26px]">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-[21px] leading-[1.15] tracking-[-0.045em] text-text">{section.heading}</h2>
            <p className="mt-[9px] text-[14px] font-normal leading-[1.72] tracking-[-0.02em] text-alt-text sm:text-[15px]">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-[32px]">
        <RelatedLinks page={page} />
      </div>
    </article>
  );
}
