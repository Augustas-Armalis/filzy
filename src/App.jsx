import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

const pageMotion = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    transitionEnd: { filter: "none" },
    transition: { duration: 0.24, ease: [0.22, 0.72, 0.24, 1], delay: 0.04 },
  },
  exit: {
    opacity: 0,
    filter: "blur(10px)",
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          {...pageMotion}
          className="flex min-h-0 flex-1 flex-col will-change-[opacity,filter]"
        >
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
        </motion.div>
      </AnimatePresence>
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
