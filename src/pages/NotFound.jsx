import { Shell } from "@/components/Shell";

// 404 — big white letters over the same switching Unsplash background.
export default function NotFound() {
  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center p-[10px]">
        <h1 className="select-none text-[26vw] font-bold leading-none tracking-tight text-white drop-shadow-lg sm:text-[20vw] lg:text-[14rem]">
          404
        </h1>
      </div>
    </Shell>
  );
}
