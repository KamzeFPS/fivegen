"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  LockKeyhole,
  Loader2,
} from "lucide-react";
export default function Purchase({
  slug,
  price,
  available,
  whopUrl,
}: {
  slug: string;
  price: number;
  available: boolean;
  whopUrl?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  }, [slug]);
  async function buy() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const d = (await r.json()) as { url: string; error?: string };
      if (!r.ok) throw new Error(d.error);
      window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="purchase-buttons">
        {available && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => void buy()}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : price === 0 ? (
              <ArrowDownToLine size={17} />
            ) : (
              <LockKeyhole size={16} />
            )}{" "}
            {price === 0 ? "Get your free copy" : "Get instant access"}
            <ArrowUpRight size={17} />
          </button>
        )}
        {whopUrl && (
          <a
            className={`button ${available ? "secondary" : "primary"} full`}
            href={whopUrl}
            rel="noreferrer"
          >
            Buy on Whop
            <ArrowUpRight size={17} />
          </a>
        )}
        {!available && !whopUrl && (
          <div className="store-message">
            This product is coming soon. The creator is still setting up
            checkout.
          </div>
        )}
      </div>
      {(available || whopUrl) && (
        <div className="secure-note">
          <LockKeyhole size={12} />
          {price === 0
            ? "Downloadable digital product"
            : whopUrl && !available
              ? "Secure checkout and delivery by Whop"
              : "Secure checkout by Stripe"}
        </div>
      )}
      {error && (
        <p role="alert" className="store-message error">
          {error}
        </p>
      )}
    </>
  );
}
