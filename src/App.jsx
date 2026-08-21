import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { clearChunkRefreshQuery, importWithRefresh } from "@/lib/chunkImport";
import Home from "@/pages/Home";
import ReceivePage from "@/pages/ReceivePage";
import DropReceivePage from "@/pages/DropReceivePage";
import PoolPage from "@/pages/PoolPage";
import NotFound from "@/pages/NotFound";

const Convert = lazy(() => importWithRefresh(() => import("@/pages/Convert")));
const Compress = lazy(() => importWithRefresh(() => import("@/pages/Compress")));
const Extract = lazy(() => importWithRefresh(() => import("@/pages/Extract")));
const Blog = lazy(() => importWithRefresh(() => import("@/pages/Blog")));
const Guide = lazy(() => importWithRefresh(() => import("@/pages/Guide")));
const Movie = lazy(() => importWithRefresh(() => import("@/pages/Movie")));
const MovieAdmin = lazy(() => importWithRefresh(() => import("@/pages/MovieAdmin")));

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
            <Route path="/d/:transferId" element={<DropReceivePage />} />
            <Route path="/p/:poolId" element={<PoolPage />} />
            <Route path="/convert" element={<Convert />} />
            <Route path="/convert/:pair" element={<Convert />} />
            <Route path="/compress" element={<Compress />} />
            <Route path="/compress/:preset" element={<Compress />} />
            <Route path="/extract" element={<Extract />} />
            <Route path="/extract/:preset" element={<Extract />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<Guide />} />
            <Route path="/movie" element={<Movie />} />
            <Route path="/movie/admin" element={<MovieAdmin />} />
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
  useEffect(() => clearChunkRefreshQuery(), []);

  return (
    <BrowserRouter>
      <Shell>
        <AnimatedRoutes />
      </Shell>
    </BrowserRouter>
  );
}
