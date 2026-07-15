import { ArrowUpRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { blogIndexPage, guidePages } from "@/content/seoCatalog";
import { collectionJsonLd, useSeo } from "@/lib/seo";

export default function Blog() {
  useSeo({
    title: blogIndexPage.title,
    description: blogIndexPage.description,
    path: blogIndexPage.path,
    jsonLd: collectionJsonLd(blogIndexPage, guidePages),
  });

  return (
    <div className="pointer-events-auto relative z-10 mx-auto w-full max-w-[980px] px-[10px] pb-[94px] pt-[74px] lg:px-0 lg:pt-[90px]">
      <main className="rounded-[18px] border border-white/30 bg-white/95 p-[18px] text-text shadow-[0_20px_70px_rgba(0,0,0,0.14)] backdrop-blur-[18px] sm:p-[26px] lg:p-[34px]">
        <header className="max-w-[700px]">
          <p className="text-[10px] uppercase tracking-[0.08em] text-alt-text">{blogIndexPage.eyebrow}</p>
          <h1 className="mt-[8px] text-[34px] leading-[1.02] tracking-[-0.055em] sm:text-[44px]">{blogIndexPage.heading}</h1>
          <p className="mt-[12px] text-[15px] font-normal leading-[1.58] tracking-[-0.025em] text-alt-text">{blogIndexPage.intro}</p>
        </header>

        <div className="mt-[26px] grid gap-[7px] md:grid-cols-2">
          {guidePages.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="group flex min-h-[126px] flex-col justify-between rounded-[12px] border border-border bg-bg p-[13px] transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-dalt-text hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
            >
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-dalt-text">{page.eyebrow}</p>
                <h2 className="mt-[5px] pr-[20px] text-[16px] leading-[1.18] text-text">{page.heading}</h2>
              </div>
              <div className="mt-[15px] flex items-center justify-between text-[10px] text-alt-text">
                <span className="flex items-center gap-[5px]"><Clock3 size={11} strokeWidth={1.17} absoluteStrokeWidth aria-hidden="true" />{page.readMinutes} min</span>
                <ArrowUpRight size={14} strokeWidth={1.17} absoluteStrokeWidth className="transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
