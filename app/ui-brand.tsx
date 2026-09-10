import { ArrowUpRight } from "lucide-react";
import type { Brief } from "@/lib/product";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <img src="/brand/fivegen-logo.webp" alt="" width="1254" height="1254" />
      </span>
      FiveGen
    </span>
  );
}
export function Cover({
  product,
  large = false,
}: {
  product: Pick<Brief, "title" | "format" | "color">;
  large?: boolean;
}) {
  return (
    <div className={`product-cover ${product.color} ${large ? "large" : ""}`}>
      <div className="cover-art" aria-hidden="true" />
      <div className="cover-top">
        <span>FIVEGEN STUDIO</span>
        <ArrowUpRight size={17} />
      </div>
      <div className="cover-title">{product.title}</div>
      <div className="cover-bottom">
        <span>{product.format.toUpperCase()}</span>
        <span className="cover-edition">FG / EDITION 01</span>
      </div>
    </div>
  );
}
