import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { DropReceiveCard, TransferLoading } from "@/components/TransferUI";
import { CtaButton, StackIcon } from "@/components/ui";
import { getDropShare, unlockDropShare } from "@/lib/drops";
import { useSeo } from "@/lib/seo";

export default function DropReceivePage() {
  const { transferId = "" } = useParams();
  const valid = /^[A-Za-z0-9_-]+$/.test(transferId);
  const [share, setShare] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem(`filzy-drop-access:${transferId}`) || "");
  useSeo({
    title: "Download shared files | Filzy",
    description: "Open files shared through Filzy.",
    path: valid ? `/d/${transferId}` : "/d",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    getDropShare(transferId, accessToken).then((value) => { if (alive) setShare({ ...value, id: transferId }); }).catch((cause) => { if (alive) setError(cause?.message || "This transfer is unavailable."); });
    return () => { alive = false; };
  }, [transferId, valid, accessToken]);

  const unlock = async () => {
    try {
      const next = await unlockDropShare(transferId, password);
      sessionStorage.setItem(`filzy-drop-access:${transferId}`, next.accessToken);
      setAccessToken(next.accessToken);
      setShare({ ...next, id: transferId });
      setPassword("");
      setError("");
    } catch (cause) { setError(cause?.message || "Incorrect password."); }
  };

  return (
    <div className="flex min-h-[100svh] items-center justify-center px-[10px] pb-[44px] pt-[60px] [&>*]:pointer-events-auto lg:justify-start lg:p-0 lg:pl-32">
      {share?.locked ? (
        <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]">
          <div className="flex min-h-[112px] flex-col items-center justify-center gap-[8px] rounded-[12px] border border-border bg-bg px-[18px] text-center"><StackIcon Icon={LockKeyhole} /><div><p className="text-[14px] text-text">Password required</p><p className="text-[11px] text-alt-text">Enter it to open these files.</p></div></div>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && password.length >= 4 && void unlock()} placeholder="Password" autoFocus className="h-[38px] rounded-[11px] border border-border bg-white px-[11px] text-[13px] text-text outline-none placeholder:text-dalt-text focus:border-text/50" />
          {error && <p className="px-[4px] text-center text-[11px] text-red-600">{error}</p>}
          <CtaButton label="Open files" disabled={password.length < 4} onClick={unlock} />
        </div>
      ) : share ? <DropReceiveCard share={share} accessToken={accessToken} /> : error ? (
        <div className="glass-surface flex w-full max-w-[280px] flex-col gap-[8px] rounded-2xl border border-white/30 bg-white/55 p-[8px]"><div className="flex min-h-[142px] items-center justify-center rounded-[12px] border border-border bg-bg px-[18px] text-center text-[13px] text-alt-text">{error}</div><CtaButton label="Return to Filzy" onClick={() => { window.location.href = "/"; }} /></div>
      ) : <TransferLoading />}
    </div>
  );
}
