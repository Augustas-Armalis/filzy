import { useSeo } from "@/lib/seo";

// 404 — big white letters over the same switching Unsplash background.
export default function NotFound() {
  useSeo({
    title: "Page not found",
    description: "This Filzy page does not exist.",
    path: "/not-found",
    robots: "noindex, follow",
  });
  return (
    <div className="flex flex-1 items-center justify-center p-[10px] [&>*]:pointer-events-auto">
      <h1 className="select-none text-[26vw] font-bold leading-none tracking-tight text-white drop-shadow-lg sm:text-[20vw] lg:text-[14rem]">
        404
      </h1>
    </div>
  );
}
