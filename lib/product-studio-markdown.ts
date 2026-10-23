import {escapeHtml,renderProductMarkdown} from './export';

const imageId=/^(?:\/api\/uploads\/|upload:)([a-f0-9]{8}-[a-f0-9-]{27})$/i;
const safeImage=(source:string)=>/^\/api\/uploads\/[a-f0-9-]{36}$/i.test(source)||/^\/api\/commerce\/customer\/[a-f0-9-]{36}\/uploads\/[a-f0-9-]{36}(?:\?inline=1)?$/i.test(source)||/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(source)&&source.length<=12_000_000||/^images\/[a-zA-Z0-9_.-]+$/.test(source);

/** Plain Markdown in, escaped HTML out. Image maps must come from the caller's
 * owned-resource lookup; this renderer never fetches or executes content. */
export function renderStudioMarkdown(body:string,assets:Record<string,string>={}):string{
  const replacements:string[]=[],prefix='FIVEGENSAFE'+Math.random().toString(36).slice(2).toUpperCase();
  const token=(html:string)=>{const key=prefix+replacements.length+'END';replacements.push(html);return key;};
  const notes=new Map<string,string>();
  let source=body.replace(/^\[\^([a-zA-Z0-9_-]{1,60})\]:[ \t]*(.*(?:\n[ \t]+[^\n]*)*)$/gm,(_,id:string,text:string)=>{notes.set(id,text.trim());return '';});
  source=source.replace(/!\[([^\]\n]*)\]\(([^\s)]+)\)/g,(original,alt:string,url:string)=>{
    const id=imageId.exec(url),mapped=assets[url]||(id?assets[id[1]]:undefined),resolved=mapped||(id?`/api/uploads/${id[1]}`:'');
    return resolved&&safeImage(resolved)?'\n\n'+token(`<figure class="studio-rich-image"><img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" loading="lazy">${alt?`<figcaption>${escapeHtml(alt)}</figcaption>`:''}</figure>`)+ '\n\n':escapeHtml(original);
  });
  source=source.replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g,(original,label:string,url:string)=>{try{const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password)return original;return token(`<a href="${escapeHtml(target.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);}catch{return original;}});
  source=source.replace(/\[\^([a-zA-Z0-9_-]{1,60})\]/g,(original,id:string)=>notes.has(id)?token(`<sup class="studio-footnote-ref"><a href="#footnote-${escapeHtml(id)}" aria-label="Footnote ${escapeHtml(id)}">${escapeHtml(id)}</a></sup>`):original);
  source=source.replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*\n((?:>[^\n]*(?:\n|$))+)/gm,(_,kind:string,content:string)=>token(`<aside class="studio-callout studio-callout-${kind.toLowerCase()}"><strong>${kind[0]+kind.slice(1).toLowerCase()}</strong>${renderProductMarkdown(content.replace(/^>\s?/gm,''))}</aside>`));
  let html=renderProductMarkdown(source);
  for(let index=replacements.length-1;index>=0;index--){const value=replacements[index],key=prefix+index+'END';if(/^<(?:figure|aside)\b/.test(value))html=html.split('<p>'+key+'</p>').join(value);html=html.split(key).join(value);}
  if(notes.size)html+=`<section class="studio-footnotes" aria-label="Footnotes"><h3>Notes</h3><ol>${[...notes].map(([id,text])=>`<li id="footnote-${escapeHtml(id)}"><span>${escapeHtml(id)}.</span> ${renderProductMarkdown(text)}</li>`).join('')}</ol></section>`;
  return html;
}
