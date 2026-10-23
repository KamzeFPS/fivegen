import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {documentLimits,ProductDocumentError,readProductArchive} from './product-document-archive';
import {createDocumentOcr,type OcrLanguage,type OcrProgress} from './product-document-ocr';

type XmlNode=Record<string,unknown>;
export type ProductImportAsset={key:string;name:string;mime:string;base64:string};
export type ProductDocumentPreview={title:string;sourceFormat:'docx'|'pdf'|'epub';sections:{id:string;title:string;body:string}[];assets:ProductImportAsset[];warnings:string[]};
const textDecoder=new TextDecoder();
const array=(value:unknown):XmlNode[]=>Array.isArray(value)?value as XmlNode[]:[];
const attr=(node:XmlNode,key:string)=>String((node[':@'] as Record<string,unknown>|undefined)?.['@_'+key]||'');
const all=(nodes:XmlNode[],tag:string):XmlNode[]=>nodes.flatMap(node=>[...(tag in node?[node]:[]),...Object.entries(node).filter(([key])=>![':@','#text'].includes(key)).flatMap(([,value])=>all(array(value),tag))]);
const plain=(nodes:XmlNode[]):string=>nodes.map(node=>Object.entries(node).map(([key,value])=>key==='#text'?String(value):key===':@'?'':plain(array(value))).join('')).join('');
function xml(bytes:Uint8Array){
  let source=textDecoder.decode(bytes);
  if(/<!ENTITY|<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC|\[)/i.test(source))throw new ProductDocumentError('Documents with external entities or DTD resources are not supported.');
  source=source.replace(/<!DOCTYPE[^>]*>/gi,'').replace(/&nbsp;/g,'&#160;');
  if(source.length>documentLimits.entry||XMLValidator.validate(source)!==true)throw new ProductDocumentError('The document contains invalid XML. Re-export it from its original application.');
  return new XMLParser({preserveOrder:true,ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,trimValues:false,ignoreDeclaration:true}).parse(source) as XmlNode[];
}
function archivePath(base:string,target:string){
  if(!target||/[\\\0]/.test(target)||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('/'))return null;
  const parts=base.split('/').slice(0,-1);
  for(const part of target.split('#')[0].split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(decodeURIComponent(part));}
  return parts.join('/');
}
function imageAssets(files:Record<string,Uint8Array>,warnings:string[]){
  const assets:ProductImportAsset[]=[],existing=new Map<string,string>();let total=0;
  const add=(path:string,alt='Image')=>{
    if(existing.has(path))return `![${alt.replace(/[\]\n]/g,'')}](import:${existing.get(path)})`;
    const bytes=files[path],extension=path.split('.').at(-1)?.toLowerCase(),mime=extension==='png'?'image/png':['jpg','jpeg'].includes(extension||'')?'image/jpeg':extension==='webp'?'image/webp':null;
    if(!bytes||!mime){warnings.push('An unsupported or missing image was omitted; keep the original manuscript for that artwork.');return '';}
    if(bytes.length>5*1024*1024||total+bytes.length>20*1024*1024||assets.length>=20)throw new ProductDocumentError('Imported images exceed the limit of 20 images, 5 MB per image, and 20 MB combined.');
    const valid=mime==='image/png'?bytes[0]===137&&textDecoder.decode(bytes.subarray(1,4))==='PNG':mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:textDecoder.decode(bytes.subarray(0,4))==='RIFF'&&textDecoder.decode(bytes.subarray(8,12))==='WEBP';
    if(!valid)throw new ProductDocumentError('An embedded image does not match its file format.');
    const key=`image-${assets.length+1}`;total+=bytes.length;existing.set(path,key);assets.push({key,name:path.split('/').at(-1)!,mime,base64:Buffer.from(bytes).toString('base64')});
    return `![${alt.replace(/[\]\n]/g,'')}](import:${key})`;
  };
  return {assets,add};
}
function normalizedSections(sections:{title:string;body:string}[]){
  const result:{id:string;title:string;body:string}[]=[];let characters=0;
  for(const section of sections){
    let body=section.body.replace(/\r\n?/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();if(!body)continue;characters+=body.length;
    let part=0;
    while(body){
      let end=Math.min(body.length,documentLimits.sectionCharacters);
      if(end<body.length){const boundary=body.lastIndexOf('\n',end);if(boundary>end/2)end=boundary;}
      result.push({id:crypto.randomUUID(),title:(section.title+(part?` (continued ${part+1})`:'')).slice(0,150)||'Imported section',body:body.slice(0,end).trim()});body=body.slice(end).trim();part++;
    }
  }
  if(characters>documentLimits.characters||result.length>documentLimits.sections)throw new ProductDocumentError('This manuscript exceeds 30 sections or 540,000 text characters. Split it into smaller volumes before importing.');
  if(!result.length)throw new ProductDocumentError('No readable text was found. Scanned PDFs require OCR before import.');
  return result;
}
function importDocx(bytes:Uint8Array,name:string):ProductDocumentPreview{
  const files=readProductArchive(bytes,'docx'),warnings:string[]=[],images=imageAssets(files,warnings),document=xml(files['word/document.xml']);
  const relationships=new Map<string,string>();
  if(files['word/_rels/document.xml.rels'])for(const node of all(xml(files['word/_rels/document.xml.rels']),'Relationship')){const path=archivePath('word/document.xml',attr(node,'Target'));if(path)relationships.set(attr(node,'Id'),path);}
  function runs(nodes:XmlNode[]):string{return nodes.map(node=>Object.entries(node).map(([tag,value])=>{
    if([':@','pPr','rPr','instrText','del'].includes(tag))return '';
    if(tag==='#text')return String(value);if(tag==='tab')return '  ';if(tag==='br')return '\n';
    if(tag==='footnoteReference')return `[^${attr(node,'id')}]`;
    if(tag==='blip'){const path=relationships.get(attr(node,'embed'));return path?'\n'+images.add(path)+'\n':'';}
    const contents=runs(array(value));
    if(tag==='r'){const props=all(array(value),'rPr');return all(props,'b').length?`**${contents}**`:all(props,'i').length?`*${contents}*`:contents;}
    return contents;
  }).join('')).join('');}
  const paragraphs=all(document,'p'),sections:{title:string;body:string}[]=[];let current={title:'Introduction',body:''};
  for(const node of paragraphs){const children=array(node.p),style=all(children,'pStyle').map(value=>attr(value,'val')).join(''),content=runs(children).trim();if(!content)continue;const heading=/^Heading\s*([1-6])$/i.exec(style);
    if(heading?.[1]==='1'){if(current.body.trim())sections.push(current);current={title:content.replace(/\*+/g,''),body:''};}
    else current.body+=(current.body?'\n\n':'')+(heading?'#'.repeat(Number(heading[1]))+' ':all(children,'numPr').length?'- ':'')+content;
  }
  if(current.body.trim())sections.push(current);
  if(files['word/footnotes.xml'])for(const note of all(xml(files['word/footnotes.xml']),'footnote')){const id=attr(note,'id');if(Number(id)<0)continue;const text=runs(array(note.footnote)).trim();for(const section of sections)if(section.body.includes(`[^${id}]`))section.body+=`\n\n[^${id}]: ${text}`;}
  warnings.push('Text, headings, emphasis, supported images, and footnotes are imported. Page geometry, text boxes, tracked changes, and advanced Word styles are not reproduced.');
  const title=files['docProps/core.xml']?plain(all(xml(files['docProps/core.xml']),'title')).trim():'';
  return {title:(title||name.replace(/\.docx$/i,'')).slice(0,100),sourceFormat:'docx',sections:normalizedSections(sections),assets:images.assets,warnings:[...new Set(warnings)]};
}
function importEpub(bytes:Uint8Array,name:string):ProductDocumentPreview{
  const files=readProductArchive(bytes,'epub'),warnings:string[]=[],images=imageAssets(files,warnings),container=xml(files['META-INF/container.xml']),root=all(container,'rootfile')[0],packagePath=root&&attr(root,'full-path');
  if(!packagePath||!files[packagePath])throw new ProductDocumentError('The EPUB package document is missing.');
  if(files['META-INF/encryption.xml'])throw new ProductDocumentError('Encrypted or DRM-protected EPUB files cannot be imported.');
  const pkg=xml(files[packagePath]),manifest=new Map(all(pkg,'item').map(node=>[attr(node,'id'),node])),sections:{title:string;body:string}[]=[];
  function html(nodes:XmlNode[],path:string):string{return nodes.map(node=>Object.entries(node).map(([tag,value])=>{
    if(tag===':@')return '';if(tag==='#text')return String(value);if(['script','style','iframe','object','embed','form','head'].includes(tag))return '';
    if(tag==='img'){const image=archivePath(path,attr(node,'src'));return image?'\n\n'+images.add(image,attr(node,'alt')||'Image')+'\n\n':'';}
    const content=html(array(value),path);
    if(/^h[1-6]$/.test(tag))return `\n\n${'#'.repeat(Number(tag.slice(1)))} ${content.trim()}\n\n`;
    if(tag==='a'&&attr(node,'type').includes('noteref'))return `[^${attr(node,'href').split('#').at(-1)}]`;
    if(['aside','li'].includes(tag)&&attr(node,'type').includes('footnote'))return `\n\n[^${attr(node,'id')}]: ${content.trim()}\n\n`;
    if(['p','div','section','article','aside'].includes(tag))return '\n\n'+content.trim()+'\n\n';
    if(tag==='li')return '\n- '+content.trim();if(tag==='br')return '\n';if(tag==='blockquote')return '\n\n'+content.trim().split('\n').map(line=>'> '+line).join('\n')+'\n\n';
    if(['strong','b'].includes(tag))return '**'+content+'**';if(['em','i'].includes(tag))return '*'+content+'*';if(tag==='code')return '`'+content+'`';return content;
  }).join('')).join('');}
  for(const ref of all(pkg,'itemref')){const item=manifest.get(attr(ref,'idref'));if(!item)throw new ProductDocumentError('The EPUB reading order references a missing chapter.');const path=archivePath(packagePath,attr(item,'href'));if(!path||!files[path])throw new ProductDocumentError('An EPUB chapter is missing or has an unsafe path.');const body=html(xml(files[path]),path).replace(/\n[ \t]+/g,'\n').trim(),heading=/^#\s+([^\n]+)/m.exec(body);sections.push({title:heading?.[1]||`Chapter ${sections.length+1}`,body:heading?body.replace(heading[0],'').trim():body});}
  warnings.push('EPUB chapters follow the publication reading order. Interactive scripts, external resources, and publisher-specific page styling are not imported.');
  return {title:(plain(all(pkg,'title')).trim()||name.replace(/\.epub$/i,'')).slice(0,100),sourceFormat:'epub',sections:normalizedSections(sections),assets:images.assets,warnings:[...new Set(warnings)]};
}
export type ProductImportOptions={ocrLanguage?:OcrLanguage;signal?:AbortSignal;onProgress?:(progress:OcrProgress)=>void};
async function importPdf(bytes:Uint8Array,name:string,options:ProductImportOptions):Promise<ProductDocumentPreview>{
  const ocr=options.ocrLanguage?await createDocumentOcr(options.ocrLanguage,options.signal,options.onProgress):null;
  const [pdfjs,worker]=await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'),import('pdfjs-dist/legacy/build/pdf.worker.mjs')]).catch(async()=>{await ocr?.close();throw new ProductDocumentError('PDF text import is unavailable on this server. Import DOCX or EPUB, or ask the administrator to enable the PDF runtime.',503);});
  (globalThis as unknown as {pdfjsWorker:unknown}).pdfjsWorker=worker;
  const task=pdfjs.getDocument({data:bytes.slice(),useWorkerFetch:false,disableFontFace:true,useSystemFonts:false,maxImageSize:ocr?8_000_000:0,stopAtErrors:true});let loadTimer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{void task.destroy().catch(()=>{});};options.signal?.addEventListener('abort',cancel,{once:true});
  try{
    const doc=await Promise.race([task.promise,new Promise<never>((_,reject)=>{loadTimer=setTimeout(()=>{reject(new ProductDocumentError('This PDF took too long to open. Split it into smaller documents.',408));void task.destroy().catch(()=>{});},20_000);})]);clearTimeout(loadTimer);if(doc.numPages>200)throw new ProductDocumentError('PDF import supports up to 200 pages. Split this manuscript into smaller volumes.');
    const groups:{title:string;body:string}[]=[],groupSize=Math.max(1,Math.ceil(doc.numPages/25)),emptyPages:number[]=[],recognizedPages:number[]=[];let characters=0;
    for(let index=1;index<=doc.numPages;index++){
      if(options.signal?.aborted)throw new ProductDocumentError('Document import was cancelled.',499);
      const page=await doc.getPage(index),content=await page.getTextContent();let text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
      if(ocr&&text.length<20){const result=await ocr.recognize(page,index);text=result.text;recognizedPages.push(index);}
      characters+=text.length;if(characters>documentLimits.characters)throw new ProductDocumentError('This PDF exceeds 540,000 text characters. Split it into smaller documents.',413);
      if(!text){emptyPages.push(index);page.cleanup();continue;}if((index-1)%groupSize===0||!groups.length)groups.push({title:groupSize===1?`Page ${index}`:`Pages ${index}–${Math.min(doc.numPages,index+groupSize-1)}`,body:''});groups.at(-1)!.body+=(groups.at(-1)!.body?'\n\n':'')+text;page.cleanup();
    }
    return {title:name.replace(/\.pdf$/i,'').slice(0,100),sourceFormat:'pdf',sections:normalizedSections(groups),assets:[],warnings:['PDF text is imported in page order. Columns, text placement, fonts, and images may need manual editing.',...(recognizedPages.length?[`Local OCR recognized pages ${recognizedPages.join(', ')}. Review every word, especially names, numbers and punctuation, before applying.`]:[]),...(emptyPages.length?[`Pages ${emptyPages.join(', ')} contained no readable text and were omitted. Enable scanned PDF recognition, or use a clearer scan.`]:[])]};
  }catch(error){if(options.signal?.aborted)throw new ProductDocumentError('Document import was cancelled.',499);if(error instanceof ProductDocumentError)throw error;throw new ProductDocumentError('This PDF could not be read. Remove password protection, use a text-based PDF, and export it again.');}finally{clearTimeout(loadTimer);options.signal?.removeEventListener('abort',cancel);try{await task.destroy();}finally{await ocr?.close();}}
}
export async function importProductDocument(bytes:Uint8Array,name:string,options:ProductImportOptions={}):Promise<ProductDocumentPreview>{
  if(!bytes.length||bytes.length>documentLimits.input)throw new ProductDocumentError('Manuscript import accepts files up to 20 MB.',413);
  if(/\.docx$/i.test(name))return importDocx(bytes,name);
  if(/\.epub$/i.test(name))return importEpub(bytes,name);
  if(/\.pdf$/i.test(name)){if(textDecoder.decode(bytes.subarray(0,5))!=='%PDF-')throw new ProductDocumentError('This file does not have a PDF header.');return importPdf(bytes,name,options);}
  throw new ProductDocumentError('Choose a DOCX, text-based PDF, or EPUB manuscript.');
}
