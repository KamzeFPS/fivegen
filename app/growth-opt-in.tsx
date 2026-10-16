"use client";
import { useState, type FormEvent } from "react";
import { marketingConsentText } from "@/lib/growth-funnel";

export function GrowthOptIn({ slug, ctaLabel }: { slug: string; ctaLabel: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await fetch("/api/growth/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, name: form.get("name"), email: form.get("email"), marketing: form.get("marketing") === "yes", website: form.get("website") }) });
      const data = await response.json() as { message: string; error?: string }; if (!response.ok) throw new Error(data.error || "Could not save your request. Please try again.");
      setMessage(data.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (message) return <div className="growth-thanks" role="status"><h2>You’re on the list.</h2><p>{message}</p></div>;
  return <form className="growth-opt-in" onSubmit={submit}>
    <h2>Let’s take the next step.</h2>
    <label>Your name<input name="name" type="text" autoComplete="name" required maxLength={150} placeholder="Alex Taylor" disabled={busy}/></label>
    <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="alex@example.com" disabled={busy}/></label>
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <label className="growth-consent"><input name="marketing" type="checkbox" value="yes" disabled={busy}/><span>{marketingConsentText} <small>Optional.</small></span></label>
    <p className="growth-help">Your details go to this creator so they can respond to your request. <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a></p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? "Sending…" : ctaLabel}</button>
  </form>;
}
