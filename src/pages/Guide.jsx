import { Navigate, useParams } from "react-router-dom";
import { ArticleContent } from "@/components/SeoContent";
import { guidePages } from "@/content/seoCatalog";
import { articleJsonLd, useSeo } from "@/lib/seo";

export default function Guide() {
  const { slug } = useParams();
  const page = guidePages.find((candidate) => candidate.slug === slug);

  useSeo(page ? {
    title: page.title,
    description: page.description,
    path: page.path,
    type: "article",
    datePublished: page.datePublished,
    dateModified: page.dateModified,
    jsonLd: articleJsonLd(page),
  } : {
    title: "Guide not found",
    description: "This Filzy guide does not exist.",
    path: `/blog/${slug || "missing"}`,
    robots: "noindex, follow",
  });

  if (!page) return <Navigate replace to="/not-found" />;

  return (
    <div className="pointer-events-auto relative z-10 mx-auto w-full max-w-[900px] px-[10px] pb-[94px] pt-[74px] lg:px-0 lg:pt-[90px]">
      <ArticleContent page={page} />
    </div>
  );
}
