import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {PDFDocument,PDFDict,PDFName,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {zipSync,strToU8} from 'fflate';
import {escapeHtml} from './export';
import {renderStudioMarkdown} from './product-studio-markdown';
import {ProductDocumentError} from './product-document-archive';
import {decisionGraphText} from './product-decision-contract';

export type StudioExportAsset={name:string;mime:string;bytes:Uint8Array};
export type StudioExportDocument={title:string;description:string;audience:string;language:string;subtitle?:string;writing?:Record<string,unknown>;sections:{id?:string;title:string;body:string;objective?:string;category?:string;studio?:Record<string,unknown>}[];files:{name:string;content:string;description?:string}[];originals:StudioExportAsset[];images:Record<string,StudioExportAsset>;cover?:StudioExportAsset;license?:string;usageInstructions?:string};
export type StudioExportFormat='html'|'pdf'|'epub'|'markdown'|'zip';
const value=(input:unknown)=>typeof input==='string'?input:'';
const themeColors={minimal:'#375669',editorial:'#b7653c',classic:'#66544b'};
const theme=(doc:StudioExportDocument)=>value(doc.writing?.theme) in themeColors?value(doc.writing?.theme) as keyof typeof themeColors:'editorial';
const filename=(name:string)=>name.replace(/[\\/\x00-\x1f]/g,'_').replace(/^\.+/,'').slice(0,150)||'resource';
const dataUrl=(asset:StudioExportAsset)=>`data:${asset.mime};base64,${Buffer.from(asset.bytes).toString('base64')}`;
function enrichedBody(section:StudioExportDocument['sections'][number]){
  const fields=section.studio||{},parts:string[]=[];
  const decisions=decisionGraphText(fields.decisionGraph);if(fields.decisionGraph!==undefined&&!decisions)throw new ProductDocumentError('Finish connecting the decision flow before exporting. Every branch must lead to an existing outcome.');
  if(section.objective)parts.push(`> [!NOTE]\n> Learning objective: ${section.objective}`);
  if(value(fields.imageUrl))parts.push(`![${section.title}](${value(fields.imageUrl)})`);
  parts.push(section.body);
  for(const [key,label] of [['takeaway','Key takeaway'],['actionStep','Action step'],['why','Why it matters'],['mistakes','Common mistakes'],['role','Owner / role'],['inputs','Inputs'],['outputs','Outputs'],['kpi','Success measures'],['decision','Decision points']])if(value(fields[key])&&(key!=='decision'||!decisions))parts.push(`### ${label}\n\n${value(fields[key])}`);
  if(typeof fields.minutes==='number')parts.push(`**Time required:** ${fields.minutes} minutes`);
  if(decisions)parts.push('### Decision flow\n\n'+decisions);
  return parts.filter(Boolean).join('\n\n');
}
function front(doc:StudioExportDocument){return [['Copyright',value(doc.writing?.copyright)],['Dedication',value(doc.writing?.dedication)]].filter(([,text])=>!!text);}
function back(doc:StudioExportDocument){return [['About the author',value(doc.writing?.aboutAuthor)],['Acknowledgments',value(doc.writing?.acknowledgments)],['How to use these resources',doc.usageInstructions||''],['License terms',doc.license||'']].filter(([,text])=>!!text);}
const title=(doc:StudioExportDocument)=>value(doc.writing?.coverTitle)||doc.title;
const subtitle=(doc:StudioExportDocument)=>value(doc.writing?.coverSubtitle)||doc.subtitle||'';
const css=(doc:StudioExportDocument)=>`*{box-sizing:border-box}body{margin:0;color:#282b2e;background:#fff;font:16px/1.8 ${doc.writing?.font==='sans'?'Arial,sans-serif':'Georgia,serif'}}main{max-width:850px;margin:auto;padding:48px}h1,h2,h3{line-height:1.25;break-after:avoid}h1{font-size:46px}h2{font-size:30px;margin-top:36px}h3{font-size:20px}a{color:${themeColors[theme(doc)]}}.cover{padding:40px 0 80px;border-bottom:5px solid ${themeColors[theme(doc)]};min-height:600px}.cover img{max-width:100%;max-height:360px;object-fit:contain}.subtitle{font-size:22px}.author{margin-top:28px}.chapter{break-before:page;padding-top:26px}.toc{padding:24px 0}.toc li{margin:12px 0}blockquote,.studio-callout{border-left:4px solid ${themeColors[theme(doc)]};padding:14px 20px;background:#f4f4f2;margin:24px 0}.studio-callout>strong{font:600 12px Arial,sans-serif;text-transform:uppercase}.studio-rich-image{margin:26px 0;break-inside:avoid}.studio-rich-image img{display:block;max-width:100%;max-height:620px;object-fit:contain}.studio-rich-image figcaption{font:12px/1.6 Arial,sans-serif;color:#61656a;margin-top:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f2;padding:18px}code{font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}.studio-footnotes{border-top:1px solid #ccc;margin-top:28px;font-size:12px}.studio-footnotes li>p{display:inline}.chapter p{orphans:3;widows:3}@media print{@page{size:A4;margin:18mm}main{padding:0}.cover{break-after:page;min-height:240mm}body{font-size:11pt}.toc{break-after:page}a{text-decoration:none}}`;
export function studioExportMarkdown(doc:StudioExportDocument){
  return `# ${title(doc)}\n\n${subtitle(doc)?subtitle(doc)+'\n\n':''}${value(doc.writing?.author)?'By '+value(doc.writing?.author)+'\n\n':''}${doc.description}\n\n`+front(doc).map(([heading,text])=>`## ${heading}\n\n${text}`).join('\n\n')+'\n\n'+(doc.writing?.showToc===false?'':'## Contents\n\n'+doc.sections.map((section,index)=>`${index+1}. ${section.title}`).join('\n')+'\n\n')+doc.sections.map(section=>`## ${section.title}\n\n${enrichedBody(section)}`).join('\n\n')+'\n\n'+back(doc).map(([heading,text])=>`## ${heading}\n\n${text}`).join('\n\n');
}
export function studioExportHtml(doc:StudioExportDocument){
  const assets=Object.fromEntries(Object.entries(doc.images).flatMap(([key,asset])=>[[key,dataUrl(asset)],[`/api/uploads/${key}`,dataUrl(asset)],[`upload:${key}`,dataUrl(asset)]]));
  const render=(body:string)=>renderStudioMarkdown(body,assets);
  return `<!doctype html><html lang="${escapeHtml(doc.language||'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src data:;style-src 'unsafe-inline';base-uri 'none';form-action 'none'"><title>${escapeHtml(title(doc))}</title><style>${css(doc)}</style></head><body><main><header class="cover">${doc.cover?`<img src="${dataUrl(doc.cover)}" alt="${escapeHtml(title(doc))} cover">`:''}<h1>${escapeHtml(title(doc))}</h1>${subtitle(doc)?`<p class="subtitle">${escapeHtml(subtitle(doc))}</p>`:''}${value(doc.writing?.author)?`<p class="author">${escapeHtml(value(doc.writing?.author))}</p>`:''}<p>${escapeHtml(doc.description)}</p></header>${front(doc).map(([heading,text])=>`<section class="chapter"><h2>${heading}</h2>${render(text)}</section>`).join('')}${doc.writing?.showToc===false?'':`<nav class="toc" aria-label="Contents"><h2>Contents</h2><ol>${doc.sections.map((section,index)=>`<li><a href="#chapter-${index+1}">${escapeHtml(section.title)}</a></li>`).join('')}</ol></nav>`}${doc.sections.map((section,index)=>`<section class="chapter" id="chapter-${index+1}">${section.category?`<p>${escapeHtml(section.category)}</p>`:''}<h2>${escapeHtml(section.title)}</h2>${render(enrichedBody(section))}</section>`).join('')}${back(doc).map(([heading,text])=>`<section class="chapter"><h2>${heading}</h2>${render(text)}</section>`).join('')}</main></body></html>`;
}
export function studioExportEpub(doc:StudioExportDocument){
  const entries:Record<string,Uint8Array|[Uint8Array,{level:0}]>={mimetype:[strToU8('application/epub+zip'),{level:0}],'META-INF/container.xml':strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),'OEBPS/style.css':strToU8(css(doc))};
  const mappings:Record<string,string>={},imageItems:string[]=[];let imageIndex=0;
  for(const [key,asset] of Object.entries(doc.images)){const imageName=`image-${++imageIndex}.${asset.mime==='image/jpeg'?'jpg':asset.mime==='image/webp'?'webp':'png'}`;entries['OEBPS/images/'+imageName]=asset.bytes;for(const ref of [key,`/api/uploads/${key}`,`upload:${key}`])mappings[ref]='images/'+imageName;imageItems.push(`<item id="image-${imageIndex}" href="images/${imageName}" media-type="${asset.mime}"/>`);}
  const coverPath=doc.cover?`images/cover.${doc.cover.mime==='image/jpeg'?'jpg':doc.cover.mime==='image/webp'?'webp':'png'}`:'';
  if(doc.cover){entries['OEBPS/'+coverPath]=doc.cover.bytes;imageItems.push(`<item id="cover-image" href="${coverPath}" media-type="${doc.cover.mime}" properties="cover-image"/>`);}
  const xhtml=(name:string,body:string)=>`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeHtml(doc.language||'en')}"><head><title>${escapeHtml(name)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body.replace(/<(img|br|hr)(\s[^>]*?)?\/?>/g,(_,tag:string,attributes:string)=>'<'+tag+(attributes||'').replace(/\/$/,'')+'/>').replace(/ loading="lazy"/g,'')}</body></html>`;
  const chapters=[...front(doc).map(([heading,body])=>({title:heading,body})),...doc.sections.map(section=>({title:section.title,body:enrichedBody(section)})),...back(doc).map(([heading,body])=>({title:heading,body}))];
  entries['OEBPS/title.xhtml']=strToU8(xhtml(title(doc),`<section class="cover">${coverPath?`<img src="${coverPath}" alt="${escapeHtml(title(doc))} cover"/>`:''}<h1>${escapeHtml(title(doc))}</h1><p class="subtitle">${escapeHtml(subtitle(doc))}</p><p>${escapeHtml(value(doc.writing?.author))}</p><p>${escapeHtml(doc.description)}</p></section>`));
  chapters.forEach((chapter,index)=>{entries[`OEBPS/chapter-${index+1}.xhtml`]=strToU8(xhtml(chapter.title,`<section class="chapter"><h1>${escapeHtml(chapter.title)}</h1>${renderStudioMarkdown(chapter.body,mappings)}</section>`));});
  entries['OEBPS/nav.xhtml']=strToU8(xhtml('Contents',`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="title.xhtml">${escapeHtml(title(doc))}</a></li>${chapters.map((chapter,index)=>`<li><a href="chapter-${index+1}.xhtml">${escapeHtml(chapter.title)}</a></li>`).join('')}</ol></nav>`));
  const id='urn:uuid:'+crypto.randomUUID(),language=/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(doc.language)?doc.language:({English:'en',Mongolian:'mn',Spanish:'es',French:'fr',German:'de',Russian:'ru'} as Record<string,string>)[doc.language]||'en';
  entries['OEBPS/content.opf']=strToU8(`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">${id}</dc:identifier><dc:title>${escapeHtml(title(doc))}</dc:title><dc:language>${language}</dc:language>${value(doc.writing?.author)?`<dc:creator>${escapeHtml(value(doc.writing?.author))}</dc:creator>`:''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/,'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((_,index)=>`<item id="chapter-${index+1}" href="chapter-${index+1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${imageItems.join('')}</manifest><spine><itemref idref="title"/>${doc.writing?.showToc===false?'':'<itemref idref="nav"/>'}${chapters.map((_,index)=>`<itemref idref="chapter-${index+1}"/>`).join('')}</spine></package>`);
  return zipSync(entries,{level:6});
}
export function studioExportZip(doc:StudioExportDocument){
  const entries:Record<string,Uint8Array>={'read-online.html':strToU8(studioExportHtml(doc))};let markdown=studioExportMarkdown(doc);
  for(const [key,asset] of Object.entries(doc.images)){const path=`images/${key}.${asset.mime==='image/jpeg'?'jpg':asset.mime==='image/webp'?'webp':'png'}`;entries[path]=asset.bytes;markdown=markdown.replaceAll(`/api/uploads/${key}`,path).replaceAll(`upload:${key}`,path);}
  entries['product.md']=strToU8(markdown);
  if(doc.license)entries['LICENSE.txt']=strToU8(doc.license);if(doc.usageInstructions)entries['START-HERE.md']=strToU8(doc.usageInstructions);
  doc.files.forEach((file,index)=>{entries[`editable/${index+1}-${filename(file.name)}`]=strToU8(file.content);});
  doc.originals.forEach((asset,index)=>{entries[`originals/${index+1}-${filename(asset.name)}`]=asset.bytes;});
  return zipSync(entries,{level:6});
}

async function pdfImage(doc:PDFDocument,asset:StudioExportAsset){
  if(asset.mime==='image/png'&&asset.bytes.length>=24){const view=new DataView(asset.bytes.buffer,asset.bytes.byteOffset,asset.bytes.byteLength);if(view.getUint32(16)*view.getUint32(20)>30_000_000)throw new ProductDocumentError('Resize this image below 30 megapixels before exporting PDF.');}
  if(asset.mime==='image/png')return doc.embedPng(asset.bytes);if(asset.mime==='image/jpeg')return doc.embedJpg(asset.bytes);
  if(asset.mime==='image/webp'){
    // This optional Node renderer must remain a runtime dependency: Workers
    // cannot load native addons, and bundling its platform binaries fails.
    const packageName=['@napi-rs','canvas'].join('/');
    try{const loadNative=createRequire(import.meta.url),canvas=loadNative(packageName) as {loadImage:(bytes:Uint8Array)=>Promise<{width:number;height:number}>;createCanvas:(width:number,height:number)=>{getContext:(kind:string)=>{drawImage:(image:unknown,x:number,y:number)=>void};toBuffer:(mime:string)=>Uint8Array}};const image=await canvas.loadImage(asset.bytes);if(image.width*image.height>30_000_000)throw new Error('dimensions');const output=canvas.createCanvas(image.width,image.height);output.getContext('2d').drawImage(image,0,0);return doc.embedPng(output.toBuffer('image/png'));}catch{throw new ProductDocumentError('A WebP image could not be converted for PDF. Replace it with a PNG or JPEG, or export EPUB/HTML.');}
  }
  throw new ProductDocumentError('PDF images must be PNG, JPEG, or WebP.');
}
export async function studioExportPdf(input:StudioExportDocument){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);doc.setTitle(title(input));doc.setAuthor(value(input.writing?.author));doc.setCreator('FiveGen');
  const family=input.writing?.font==='sans'?'NotoSans':'NotoSerif';
  const fonts=await Promise.all(['Regular','Bold','Italic'].map(style=>readFile(resolve('public/fonts',`${family}-${style}.ttf`)))).catch(()=>{throw new ProductDocumentError('PDF fonts are unavailable on this server. Export EPUB or HTML, or ask the administrator to include the bundled document fonts.',503);});
  const [normal,bold,italic]=await Promise.all(fonts.map(bytes=>doc.embedFont(bytes,{subset:true})));
  // The bundled Noto text fonts omit arrows and checklist symbols. PDF's
  // standard symbol fonts cover these real Unicode glyphs without a download.
  const symbolFonts=await Promise.all([StandardFonts.Symbol,StandardFonts.ZapfDingbats].map(name=>doc.embedFont(name)));
  const symbolCharacters=new Map(symbolFonts.map(font=>[font,new Set<string>()]));
  const supported=new Map([normal,bold,italic,...symbolFonts].map(font=>[font,new Set(font.getCharacterSet())]));
  const compatibleSymbols:Record<string,string>={'☐':'[ ]','☑':'[x]','☒':'[x]','✅':'[check]','❎':'[x]','❌':'[cross]','↖':'<up-left>','↗':'<up-right>','↘':'<down-right>','↙':'<down-left>','□':'[ ]','▪':'•','▫':'[ ]','○':'( )','◯':'( )','☆':'*','⚠':'[!]','⚡':'[!]','\ufe0e':'','\ufe0f':''};
  function fontRuns(source:string,preferred:PDFFont){
    const result:{text:string;font:PDFFont}[]=[];
    const append=(text:string,font:PDFFont)=>{if(result.at(-1)?.font===font)result[result.length-1].text+=text;else result.push({text,font});};
    for(const character of source){
      const code=character.codePointAt(0)!,font=[preferred,...symbolFonts,normal].find(candidate=>supported.get(candidate)!.has(code));
      if(font){symbolCharacters.get(font)?.add(character);append(character,font);continue;}
      const replacement=compatibleSymbols[character];
      if(replacement!==undefined){if(replacement)append(replacement,preferred);continue;}
      throw new ProductDocumentError(`The PDF font cannot render U+${code.toString(16).toUpperCase()}. Use EPUB/HTML for this script, or replace that character before exporting PDF.`);
    }
    return result;
  }
  const width=595.28,height=841.89,margin=54,usable=width-2*margin;let page:PDFPage,y=0;
  const next=()=>{page=doc.addPage([width,height]);y=height-margin;};next();
  const check=(amount:number)=>{if(y-amount<margin)next();};
  const strip=(source:string)=>source.replace(/\[\^([^\]]+)\]/g,' [$1] ').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
  function text(source:string,size=11,font:PDFFont=normal,color=rgb(.15,.16,.17),indent=0){
    const paragraphs=strip(source).replace(/\t/g,'  ').split('\n');
    for(const paragraph of paragraphs){
      let lineWidth=0;const pieces:{text:string;font:PDFFont}[]=[];
      const flush=()=>{check(size*1.6);let x=margin+indent;for(const piece of pieces){page.drawText(piece.text,{x,y,font:piece.font,size,color});x+=piece.font.widthOfTextAtSize(piece.text,size);}y-=size*1.6;pieces.length=0;lineWidth=0;};
      const runs=paragraph.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g);
      for(const run of runs){const runFont=/^(?:\*\*|__)/.test(run)?bold:/^\*[^*]/.test(run)?italic:font,clean=run.replace(/^\*\*|\*\*$|^__|__$|^\*|\*$|^`|`$/g,'');for(const token of clean.split(/(\s+)/).filter(Boolean)){
        const tokenPieces=fontRuns(token,runFont),measure=tokenPieces.reduce((sum,piece)=>sum+piece.font.widthOfTextAtSize(piece.text,size),0);if(lineWidth+measure>usable-indent&&pieces.length)flush();
        const append=(text:string,font:PDFFont)=>{if(pieces.at(-1)?.font===font)pieces[pieces.length-1].text+=text;else pieces.push({text,font});};
        if(measure>usable-indent){for(const piece of tokenPieces)for(const character of piece.text){const characterWidth=piece.font.widthOfTextAtSize(character,size);if(lineWidth+characterWidth>usable-indent&&pieces.length)flush();if(lineWidth||character.trim()){append(character,piece.font);lineWidth+=characterWidth;}}}
        else if(lineWidth||token.trim()){for(const piece of tokenPieces)append(piece.text,piece.font);lineWidth+=measure;}
      }}flush();
    }y-=5;
  }
  async function image(asset:StudioExportAsset,alt:string){const embedded=await pdfImage(doc,asset),scale=Math.min(usable/embedded.width,360/embedded.height,1),imageWidth=embedded.width*scale,imageHeight=embedded.height*scale;check(imageHeight+30);page.drawImage(embedded,{x:margin+(usable-imageWidth)/2,y:y-imageHeight,width:imageWidth,height:imageHeight});y-=imageHeight+8;if(alt)text(alt,9,italic,rgb(.4,.4,.4));y-=8;}
  const assetFor=(url:string)=>input.images[url]||input.images[url.replace(/^\/api\/uploads\/|^upload:/,'')];
  async function markdown(body:string){
    const lines=body.replace(/\r\n?/g,'\n').split('\n');let code=false;
    for(const line of lines){if(/^\s*```/.test(line)){code=!code;continue;}if(!line.trim()){y-=6;continue;}const picture=/!\[([^\]]*)\]\(([^)]+)\)/.exec(line);if(picture){if(picture.index)text(line.slice(0,picture.index));const asset=assetFor(picture[2]);if(asset)await image(asset,picture[1]);else text('[Image unavailable: '+picture[1]+']',10,italic);if(picture.index+picture[0].length<line.length)text(line.slice(picture.index+picture[0].length));continue;}
      const heading=/^(#{1,6})\s+(.+)/.exec(line);if(heading){check(50);y-=10;text(heading[2],Math.max(12,22-heading[1].length*2),bold);continue;}
      if(/^>\s*\[!/.test(line)){text(line.replace(/^>\s*\[!([^\]]+)\]/,'$1'),10,bold,rgb(.35,.3,.23),12);continue;}
      if(/^>/.test(line)){text(line.replace(/^>\s?/,''),11,italic,rgb(.35,.35,.35),14);continue;}
      if(/^\[\^[^\]]+\]:/.test(line)){text(line.replace(/^\[\^([^\]]+)\]:/,'$1.'),9,normal,rgb(.35,.35,.35));continue;}
      text(line,code?9:11,code?normal:/^\s*\*\*[^*]+\*\*\s*$/.test(line)?bold:normal);
    }
  }
  if(input.cover)await image(input.cover,'');text(title(input),30,bold);if(subtitle(input))text(subtitle(input),16);if(value(input.writing?.author))text(value(input.writing?.author),13,italic);y-=16;text(input.description,11);
  for(const [heading,body] of front(input)){next();text(heading,24,bold);await markdown(body);}
  if(input.writing?.showToc!==false){next();text('Contents',24,bold);input.sections.forEach((section,index)=>text(`${index+1}. ${section.title}`,12));}
  for(const section of input.sections){next();if(section.category)text(section.category,10,italic);text(section.title,24,bold);await markdown(enrichedBody(section));}
  for(const [heading,body] of back(input)){next();text(heading,24,bold);await markdown(body);}
  const pages=doc.getPages();pages.forEach((entry,index)=>entry.drawText(`${index+1} / ${pages.length}`,{x:width-margin-40,y:28,font:normal,size:8,color:rgb(.45,.45,.45)}));
  // Base-14 symbol fonts need an explicit Unicode map: without it some PDF
  // readers extract the encoded checkmark as "3" instead of the authored ✓.
  for(const [font,characters] of symbolCharacters){
    if(!characters.size)continue;
    const mappings=[...characters].map(character=>{const encoded=Array.from(font.encodeText(character).asBytes(),byte=>byte.toString(16).padStart(2,'0')).join('');let unicode='';for(let index=0;index<character.length;index++)unicode+=character.charCodeAt(index).toString(16).padStart(4,'0');return `<${encoded}> <${unicode}>`;});
    const groups:string[]=[];for(let index=0;index<mappings.length;index+=100){const group=mappings.slice(index,index+100);groups.push(`${group.length} beginbfchar\n${group.join('\n')}\nendbfchar`);}
    const cmap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /FiveGenSymbols def\n/CMapType 2 def\n1 begincodespacerange\n<00> <ff>\nendcodespacerange\n${groups.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    await font.embed();doc.context.lookup(font.ref,PDFDict).set(PDFName.of('ToUnicode'),doc.context.register(doc.context.flateStream(cmap)));
  }
  return doc.save();
}
export async function createStudioExport(doc:StudioExportDocument,format:StudioExportFormat){
  if(format==='pdf')return {bytes:await studioExportPdf(doc),mime:'application/pdf',extension:'pdf'};
  if(format==='epub')return {bytes:studioExportEpub(doc),mime:'application/epub+zip',extension:'epub'};
  if(format==='zip')return {bytes:studioExportZip(doc),mime:'application/zip',extension:'zip'};
  if(format==='markdown')return {bytes:strToU8(studioExportMarkdown(doc)),mime:'text/markdown; charset=utf-8',extension:'md'};
  return {bytes:strToU8(studioExportHtml(doc)),mime:'text/html; charset=utf-8',extension:'html'};
}
