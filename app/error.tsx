"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="delivery-card panel">
      <h1>We couldn’t load this page.</h1>
      <p>Your saved work is safe. Please try again in a moment.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <a className="text-link" href="/">
        Back to your workspace
      </a>
    </main>
  );
}
