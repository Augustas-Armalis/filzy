import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import About from "@/pages/About";

/*
  HashRouter is used so client-side routing works on GitHub Pages with zero
  server config (URLs look like filzy.site/#/about). If you'd rather have clean
  URLs (filzy.site/about), switch to BrowserRouter and add the standard
  GitHub Pages 404.html SPA redirect.
*/
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
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
