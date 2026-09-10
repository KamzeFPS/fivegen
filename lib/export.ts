import type { Product } from "./product";
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function productHtml(p: Product) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.title)}</title><style>body{margin:0;background:#f8f7f3;font:16px/1.9 system-ui,sans-serif;color:#38352e}main{max-width:780px;margin:auto;background:white;padding:65px}header{border-bottom:2px solid #e9d9c4;padding:0 0 35px;margin-bottom:40px}h1{font:46px/1.15 Georgia,serif;letter-spacing:-1px}h2{font-size:24px;line-height:1.4;margin:40px 0 20px}.body{white-space:pre-wrap}small{letter-spacing:2px;color:#b39471}footer{margin-top:60px;padding-top:20px;border-top:1px solid #ddd;color:#999;font-size:12px}@media(max-width:600px){main{padding:25px}h1{font-size:34px}}@media print{body{background:white}main{padding:0;max-width:none}section{break-inside:auto}h2{break-after:avoid}header{break-after:page}@page{margin:22mm}}</style></head><body><main><header><small>FIVEGEN · ${escapeHtml(p.format.toUpperCase())}</small><h1>${escapeHtml(p.title)}</h1><p>${escapeHtml(p.description)}</p></header>${p.content.sections.map((s) => `<section><h2>${escapeHtml(s.title)}</h2><div class="body">${escapeHtml(s.body)}</div></section>`).join("")}<footer>${escapeHtml(p.title)} · Created with FiveGen</footer></main></body></html>`;
}
