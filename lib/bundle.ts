import { zipSync, strToU8 } from "fflate";
import type { Product } from "./product";
import { productHtml } from "./export";
export function productBundle(p: Product, includeMarketing = true) {
  const entries: Record<string, Uint8Array> = {
    "01-product/guide.html": strToU8(productHtml(p)),
    "01-product/product.md": strToU8(
      "# " +
        p.title +
        "\n\n" +
        p.description +
        "\n\n" +
        p.content.sections
          .map((s) => "## " + s.title + "\n\n" + s.body)
          .join("\n\n"),
    ),
    "README.txt": strToU8(
      `${p.title}\n\nOpen 01-product/guide.html in your browser. Use Print > Save as PDF to create a PDF.${p.content.files?.length ? "\nSupporting resources are in 02-resources. CSV files open in Excel or Google Sheets.\nReview any generated code before running it." : ""}\n\nCreated with FiveGen.`,
    ),
  };
  for (const f of (p.content.files || []))
    entries[`02-resources/${f.name}`] =
      strToU8(f.content);
  if (includeMarketing) {
    if (p.content.launch.trim()) entries["03-marketing/launch-campaign.txt"] = strToU8(p.content.launch);
    if (p.content.salesCopy?.trim()) entries["03-marketing/sales-page.txt"] = strToU8(p.content.salesCopy);
    const directions = [p.content.imagePrompt?.trim() && `Image direction\n${p.content.imagePrompt}`,
      p.content.videoPrompt?.trim() && `Video direction\n${p.content.videoPrompt}`].filter(Boolean);
    if (directions.length) entries["03-marketing/creative-prompts.txt"] = strToU8(directions.join("\n\n"));
  }
  return zipSync(entries, { level: 6 }).buffer as ArrayBuffer;
}
