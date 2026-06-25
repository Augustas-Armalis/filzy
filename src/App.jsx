import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import ComingSoon from "@/pages/ComingSoon";
import Home from "@/pages/Home";
import About from "@/pages/About";

/*
  Routes:
    /            → public "Coming soon" landing (no nav chrome)
    /homepage    → the starter showcase (inside the shared Layout)
    /about       → second page

  HashRouter keeps client routing working on GitHub Pages with no server config.
*/
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ComingSoon />} />
        <Route element={<Layout />}>
          <Route path="/homepage" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-3xl px-6 py-16">
                <h1 className="text-2xl font-bold">404</h1>
                <p className="mt-2 text-muted-foreground">Page not found.</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
