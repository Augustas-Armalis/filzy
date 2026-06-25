import { useEffect } from "react";
import { motion } from "framer-motion";

/*
  The public landing page at "/". Intentionally bare: just the wordmark line on
  a near-black background. SEO/meta lives in index.html.
*/
export default function ComingSoon() {
  // Paint the whole page (incl. mobile overscroll) #070808 while this is shown.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#070808";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-[#070808] px-6 text-center">
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="font-bold tracking-tight text-white text-xl sm:text-2xl"
      >
        Coming soon...
      </motion.h1>
    </div>
  );
}
