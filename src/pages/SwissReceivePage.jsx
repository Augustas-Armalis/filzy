import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { DropReceiveCard, SwissReceiveCard } from "@/components/SwissTransferUI";
import { CtaButton } from "@/components/ui";
import { getDropShare } from "@/lib/drops";
import { useSeo } from "@/lib/seo";

export default function SwissReceivePage() {
  const { transferId = "" } = useParams();
  const valid = /^[A-Za-z0-9_-]+$/.test(transferId);
  const directTransferId = transferId.startsWith("s-") ? transferId.slice(2) : "";
  const [share, setShare] = useState(null);
  const [error, setError] = useState("");
  useSeo({
    title: "Download shared files | Filzy",
    description: "Open files shared through Filzy and SwissTransfer.",
    path: valid ? `/d/${transferId}` : "/d",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    if (!valid || directTransferId) return;
    let alive = true;
    getDropShare(transferId).then((value) => { if (alive) setShare(value); }).catch((cause) => { if (alive) setError(cause?.message || "This transfer is unavailable."); });
    return () => { alive = false; };
  }, [transferId, valid, directTransferId]);

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-[10px] pb-[44px] pt-[60px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
      {directTransferId ? <SwissReceiveCard transferId={directTransferId} /> : share ? <DropReceiveCard share={share} /> : error ? (
        <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><div className="flex min-h-[142px] items-center justify-center rounded-[12px] border border-border bg-bg px-[18px] text-center text-[13px] text-alt-text">{error}</div><CtaButton label="Return to Filzy" onClick={() => { window.location.href = "/"; }} /></div>
      ) : null}
    </div>
  );
}
