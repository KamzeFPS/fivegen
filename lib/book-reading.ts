import type {ProductContent} from './product';
import type {ProductStudioConfig} from './product-studio-contract';

export type BookReaderContent={id:string;title:string;builderType?:string;description?:string;studio?:ProductStudioConfig;sections:ProductContent['sections'];downloads?:{id:string;name:string;mime:string;size:number}[];files:{name:string;description?:string;content?:string}[];coverUrl?:string|null;coverUploadId?:string};
export type BookEntry={id:string;title:string;body:string;kind:'chapter'|'frontmatter'|'backmatter';sectionIndex?:number;category?:string};
export type BookReadingState={version:1;activeId:string;bookmarkId:string|null;font:'serif'|'sans';size:'small'|'medium'|'large'};
const string=(value:unknown)=>typeof value==='string'?value:'';
const uploadId=/(?:\/api\/uploads\/|upload:)([a-f0-9]{8}-[a-f0-9-]{27})/gi;
// Keep the complete escaped-alt/optional-caption grammar aligned with the
// shared renderer: every image it can resolve must pass this authorization map.
const markdownImage=/!\[((?:\\.|[^\]\\\r\n])*)\]\(([^\s)]+)(?:[ \t]+"((?:\\.|[^"\\\r\n])*)")?[ \t]*\)/g;
const imageUploadId=/^(?:\/api\/uploads\/|upload:)([a-f0-9]{8}-[a-f0-9-]{27})$/i;

export function bookEntries(content:BookReaderContent):BookEntry[]{
 const writing=content.studio?.writing||{},entries:BookEntry[]=[];
 for(const [field,title] of [['copyright','Copyright'],['dedication','Dedication']] as const)if(string(writing[field]).trim())entries.push({id:field,title,body:string(writing[field]),kind:'frontmatter'});
 content.sections.forEach((section,index)=>entries.push({id:section.id?`chapter-${section.id}`:`chapter-${index}`,title:section.title||`Chapter ${index+1}`,body:section.body,kind:'chapter',sectionIndex:index,category:section.category}));
 for(const [field,title] of [['aboutAuthor','About the author'],['acknowledgments','Acknowledgments']] as const)if(string(writing[field]).trim())entries.push({id:field,title,body:string(writing[field]),kind:'backmatter'});
 return entries;
}
export function bookReadingKey(orderId:string){return 'fivegen:book-reading:order:'+encodeURIComponent(orderId);}
export function defaultBookReading(entries:BookEntry[],font:unknown='serif'):BookReadingState{return {version:1,activeId:(entries.find(entry=>entry.kind==='chapter')||entries[0])?.id||'',bookmarkId:null,font:font==='sans'?'sans':'serif',size:'medium'};}
/** Persist navigation/preferences only, never manuscript text or completion claims. */
export function restoreBookReading(raw:string|null,entries:BookEntry[],font:unknown='serif'):BookReadingState{
 const initial=defaultBookReading(entries,font);if(!raw||raw.length>2000)return initial;
 try{const saved:unknown=JSON.parse(raw);if(!saved||typeof saved!=='object'||Array.isArray(saved))return initial;const value=saved as Record<string,unknown>,ids=new Set(entries.map(entry=>entry.id));if(value.version!==1)return initial;return {...initial,activeId:typeof value.activeId==='string'&&ids.has(value.activeId)?value.activeId:initial.activeId,bookmarkId:typeof value.bookmarkId==='string'&&ids.has(value.bookmarkId)?value.bookmarkId:null,font:value.font==='sans'?'sans':value.font==='serif'?'serif':initial.font,size:value.size==='small'||value.size==='large'?value.size:'medium'};}catch{return initial;}
}
export function bookImageAssets(content:BookReaderContent,preview=false){
 return Object.fromEntries((content.downloads||[]).filter(file=>file.mime.startsWith('image/')&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(file.id)).flatMap(file=>{const url=preview?`/api/uploads/${encodeURIComponent(file.id)}`:`/api/commerce/customer/${encodeURIComponent(content.id)}/uploads/${encodeURIComponent(file.id)}?inline=1`;return [[file.id,url],[`/api/uploads/${file.id}`,url],[`upload:${file.id}`,url]];}));
}
export function bookMarkdownSource(body:string,assets:Record<string,string>){
 // The shared Markdown renderer permits an owner URL fallback. Remove unknown
 // references before calling it so a purchased book can never use that fallback.
 return body.replace(markdownImage,(original,_alt:string,url:string)=>{const id=imageUploadId.exec(url)?.[1];return id&&!assets[id]?'[Image unavailable]':original;});
}
export function bookIllustrationUrl(source:unknown,assets:Record<string,string>){
 const value=string(source),id=/^(?:\/api\/uploads\/|upload:)([a-f0-9]{8}-[a-f0-9-]{27})$/i.exec(value)?.[1];
 if(id)return assets[id]||'';
 // Keep explicitly supplied public illustrations from older written products.
 // Private upload references still require the purchased asset map above.
 if(value.length>2000)return '';
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function bookExtras(content:BookReaderContent){
 const inline=new Set<string>();
 const scan=(source:unknown)=>{for(const match of string(source).matchAll(uploadId))inline.add(match[1].toLowerCase());};
 const markdown=(source:unknown)=>{for(const match of string(source).matchAll(markdownImage)){const id=imageUploadId.exec(match[2])?.[1];if(id)inline.add(id.toLowerCase());}};
 for(const entry of bookEntries(content))markdown(entry.body);
 for(const section of content.sections){scan(section.studio?.imageUrl);for(const field of ['takeaway','why','mistakes','actionStep','reflection','transcript'])markdown(section.studio?.[field]);markdown(section.studio?.assignment?.prompt);}
 scan(content.coverUrl);if(content.coverUploadId)inline.add(content.coverUploadId.toLowerCase());
 return {...content,downloads:(content.downloads||[]).filter(file=>!file.mime.startsWith('image/')||!inline.has(file.id.toLowerCase()))};
}
export function bookExportHref(contentId:string,format:'pdf'|'epub',preview=false,exportBase?:string){
 const customerBase=`/api/commerce/customer/${encodeURIComponent(contentId)}/export`;
 const base=preview?(exportBase&&/^\/api\/builder\/[a-f0-9-]{36}\/export$/i.test(exportBase)?exportBase:null):customerBase;
 return base?`${base}?format=${format}`:null;
}
export function bookCoverUrl(content:BookReaderContent,preview=false){
 const value=content.coverUrl||'';
 if(value===`/api/commerce/customer/${encodeURIComponent(content.id)}/cover`)return value;
 if(preview&&/^\/api\/(?:uploads\/[a-f0-9-]{36}|builder-cover\/[^/?#]+)$/i.test(value))return value;
 return '';
}
