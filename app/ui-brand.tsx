import { ArrowUpRight } from "lucide-react";
import type { Brief } from "@/lib/product";
/** The supplied lockup, including its original lettering and orange mark. */
export function Brand({tone = 'auto'}: {tone?: 'auto' | 'dark' | 'light'} = {}) {
  return (
    <span className="brand" data-brand-tone={tone} role="img" aria-label="FiveGen">
      {(tone === 'auto' ? ['dark', 'light'] : [tone]).map(variant => <img key={variant} className={`brand-lockup brand-lockup-${variant}`} src={`/brand/fivegen-sparkle-${variant}.webp`} alt="" aria-hidden="true" width="181" height="40" decoding="async" />)}
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
