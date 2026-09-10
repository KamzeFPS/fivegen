import { ArrowUpRight, Layers3 } from "lucide-react";
import type { Brief } from "@/lib/product";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Layers3 size={22} strokeWidth={2.5} />
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
