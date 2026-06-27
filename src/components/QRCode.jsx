import { useEffect, useState } from "react";
import QR from "qrcode";

// Renders a real scannable QR for the share link, themed to match (#050505 on
// white). Fills its container; the parent supplies the sizing/padding.
export function QRCode({ value }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!value) return;
    let alive = true;
    // High error correction so the centered logo can obscure the middle.
    QR.toDataURL(value, { margin: 0, width: 480, errorCorrectionLevel: "H", color: { dark: "#050505", light: "#ffffff" } })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);

  if (!src) return <div className="aspect-square w-full animate-pulse rounded-[6px] bg-bg" />;
  return (
    <div className="relative aspect-square w-full">
      <img src={src} alt="Share link QR code" className="h-full w-full object-contain" />
      {/* Filzy mark in the middle — sits on a white pad so scanners ignore it. */}
      <div className="absolute inset-0 m-auto flex h-[26%] w-[26%] items-center justify-center rounded-[7px] bg-white p-[5px]">
        <img src="/branding/dark-filzy-logo.svg" alt="" className="h-full w-full object-contain" />
      </div>
    </div>
  );
}
