import { Brand } from "./ui-brand";
export default function NotFound() {
  return (
    <main className="storefront">
      <nav className="store-nav">
        <a href="/">
          <Brand />
        </a>
      </nav>
      <div className="delivery-card panel">
        <h1>This page isn’t available.</h1>
        <p>
          The creator may still be working on this product, or the link may have
          changed.
        </p>
        <a className="button primary" href="/">
          Back to FiveGen
        </a>
      </div>
    </main>
  );
}
