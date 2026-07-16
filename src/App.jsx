import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "@/components/Shell";
import Home from "@/pages/Home";
import ReceivePage from "@/pages/ReceivePage";
import NotFound from "@/pages/NotFound";

const Convert = lazy(() => import("@/pages/Convert"));
const Compress = lazy(() => import("@/pages/Compress"));
const Extract = lazy(() => import("@/pages/Extract"));
const Blog = lazy(() => import("@/pages/Blog"));
const Guide = lazy(() => import("@/pages/Guide"));

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<div className="flex flex-1" />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/send/:intent" element={<Home />} />
            <Route path="/s/:id" element={<ReceivePage />} />
            <Route path="/convert" element={<Convert />} />
            <Route path="/convert/:pair" element={<Convert />} />
            <Route path="/compress" element={<Compress />} />
            <Route path="/compress/:preset" element={<Compress />} />
            <Route path="/extract" element={<Extract />} />
            <Route path="/extract/:preset" element={<Extract />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<Guide />} />
            <Route path="/not-found" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

/* Persistent shell + clean URL routing with animated page and photo changes. */
export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <AnimatedRoutes />
      </Shell>
    </BrowserRouter>
  );
}
