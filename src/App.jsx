import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import ReceivePage from "@/pages/ReceivePage";
import NotFound from "@/pages/NotFound";

/*
  HashRouter keeps client routing working on GitHub Pages with no server config.
  "/" is the sender app; "/s/:id" is the recipient who opened a beam share link
  (filzy.site/#/s/<id>) and connects peer-to-peer. Unknown URLs render the 404.
*/
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:id" element={<ReceivePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
