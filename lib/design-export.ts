import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import fontkit from '@pdf-lib/fontkit';
import {PDFDocument,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix,setLineJoin,LineJoinStyle,LineCapStyle,type PDFFont,type PDFImage} from 'pdf-lib';
import {strToU8,zipSync} from 'fflate';
import {designDocumentSchema,type DesignDocument,type DesignElement,type DesignPage} from './design-document';
import {designElementTransform,layoutDesignText} from './design-text-layout';

export type DesignExportFormat='svg'|'pdf'|'json'|'zip';
export type DesignExportAsset={mime:string;bytes:Uint8Array};
export type DesignExportAssets=Record<string,DesignExportAsset>;
export class DesignExportError extends Error{constructor(message:string,public status=400){super(message);this.name='DesignExportError';}}
type TextElement=Extract<DesignElement,{type:'text'}>;
type VerifiedAsset={mime:'image/png';bytes:Uint8Array};
const pixelsToPoints=.75;
const xml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'');
const number=(value:number)=>Number(value.toFixed(5));
const dataUrl=(asset:DesignExportAsset)=>`data:${asset.mime};base64,${Buffer.from(asset.bytes).toString('base64')}`;
const fontKey=(element:TextElement)=>`${element.fontFamily==='serif'?'NotoSerif':'NotoSans'}-${element.fontWeight==='bold'?'Bold':'Regular'}`;
const fonts=new Map<string,Promise<Uint8Array>>();
function fontBytes(key:string){let promise=fonts.get(key);if(!promise){promise=readFile(resolve('public/fonts',key+'.ttf')).catch(()=>{fonts.delete(key);throw new DesignExportError('The bundled print fonts are unavailable. Ask the administrator to include public/fonts.',503);});fonts.set(key,promise);}return promise;}
const cssFontName=(element:TextElement)=>'FiveGen'+fontKey(element).replaceAll('-','');
function parse(input:DesignDocument){const result=designDocumentSchema.safeParse(input);if(!result.success)throw new DesignExportError('This design is invalid. '+result.error.issues[0]?.message);return result.data;}
function pagesFor(document:DesignDocument,pageId?:string){if(!pageId)return document.pages;const page=document.pages.find(page=>page.id===pageId);if(!page)throw new DesignExportError('The selected page no longer exists.',404);return [page];}

function rasterDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}|undefined{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png'&&bytes.length>=24&&Buffer.from(bytes.subarray(12,16)).toString()==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20)};
  if(mime==='image/jpeg'){
    let offset=2;
    while(offset+4<=bytes.length){
      if(bytes[offset++]!==255)return;while(offset<bytes.length&&bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===217||marker===218)return;if(marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>bytes.length)return;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)return;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
      offset+=length;
    }
  }
  if(mime==='image/webp'){
    let offset=12;
    const uint24=(start:number)=>bytes[start]+bytes[start+1]*256+bytes[start+2]*65536;
    while(offset+8<=bytes.length){
      const name=Buffer.from(bytes.subarray(offset,offset+4)).toString(),length=view.getUint32(offset+4,true),start=offset+8;if(start+length>bytes.length)return;
      if(name==='VP8X'&&length>=10)return {width:uint24(start+4)+1,height:uint24(start+7)+1};
      if(name==='VP8L'&&length>=5&&bytes[start]===47)return {width:1+bytes[start+1]+((bytes[start+2]&63)<<8),height:1+(bytes[start+2]>>6)+(bytes[start+3]<<2)+((bytes[start+4]&15)<<10)};
      if(name==='VP8 '&&length>=10&&bytes[start+3]===157&&bytes[start+4]===1&&bytes[start+5]===42)return {width:view.getUint16(start+6,true)&16383,height:view.getUint16(start+8,true)&16383};
      offset=start+length+(length%2);
    }
  }
}

/** Decode supplied raster bytes locally, then re-encode without active markup or metadata. */
async function verifyAssets(pages:DesignPage[],assets:DesignExportAssets):Promise<Record<string,VerifiedAsset>>{
  const ids=[...new Set(pages.flatMap(page=>page.elements.flatMap(element=>element.type==='image'?[element.uploadId]:[])))];
  const result:Record<string,VerifiedAsset>={};let total=0,totalPixels=0;
  for(const id of ids){
    const asset=Object.hasOwn(assets,id)?assets[id]:undefined;
    if(!asset)throw new DesignExportError('An image is unavailable. Re-upload it before exporting.');
    if(!(asset.bytes instanceof Uint8Array)||asset.bytes.length<12||asset.bytes.length>12_000_000||!['image/png','image/jpeg','image/webp'].includes(asset.mime))throw new DesignExportError('Design images must be verified PNG, JPEG or WebP raster files.');
    total+=asset.bytes.length;if(total>32_000_000)throw new DesignExportError('The images exceed the 32 MB export limit.',413);
    const bytes=asset.bytes,signature=asset.mime==='image/png'?bytes[0]===137&&Buffer.from(bytes.subarray(1,8)).equals(Buffer.from('PNG\r\n\x1a\n')):asset.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP';
    if(!signature)throw new DesignExportError('An image file does not match its declared raster format.');
    const dimensions=rasterDimensions(bytes,asset.mime);
    if(!dimensions)throw new DesignExportError('An image could not be decoded safely. Re-upload a PNG or JPEG image.');
    totalPixels+=dimensions.width*dimensions.height;
    if(dimensions.width<1||dimensions.height<1||dimensions.width>8192||dimensions.height>8192||dimensions.width*dimensions.height>30_000_000||totalPixels>100_000_000)throw new DesignExportError('Resize images below 30 megapixels each and 100 megapixels in total before exporting.',413);
    try{
      const packageName='@napi-rs/canvas';
      const native=createRequire(import.meta.url)(packageName) as {loadImage:(bytes:Uint8Array)=>Promise<{width:number;height:number}>;createCanvas:(width:number,height:number)=>{getContext:(kind:string)=>{drawImage:(image:unknown,x:number,y:number)=>void};toBuffer:(mime:string)=>Uint8Array}};
      const image=await native.loadImage(bytes);
      if(image.width!==dimensions.width||image.height!==dimensions.height)throw new Error('dimensions');
      const canvas=native.createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
      result[id]={mime:'image/png',bytes:new Uint8Array(canvas.toBuffer('image/png'))};
    }catch{throw new DesignExportError('An image could not be decoded safely. Re-upload a PNG or JPEG image.');}
  }
  return result;
}

function svgElement(element:DesignElement,assets:Record<string,VerifiedAsset>){
  const start=`<g data-element-id="${xml(element.id)}" transform="${designElementTransform(element)}" opacity="${element.opacity}">`;
  let shape='';
  if(element.type==='text'){
    const anchor=element.align==='center'?'middle':element.align==='right'?'end':'start';
    shape=layoutDesignText(element).map(line=>{
      if(element.fontFamily==='mono'){
        const width=[...line.text].length*element.fontSize*.62,start=element.align==='center'?(element.width-width)/2:element.align==='right'?element.width-width:0;
        return `<text font-family="${cssFontName(element)}" font-size="${element.fontSize}" font-weight="${element.fontWeight}" fill="${element.fill}" xml:space="preserve">${[...line.text].map((char,index)=>`<tspan x="${number(start+index*element.fontSize*.62)}" y="${number(line.y)}">${xml(char)}</tspan>`).join('')}</text>`;
      }
      return `<text x="${line.x}" y="${number(line.y)}" text-anchor="${anchor}" font-family="${cssFontName(element)}" font-size="${element.fontSize}" font-weight="${element.fontWeight}" fill="${element.fill}" xml:space="preserve">${xml(line.text)}</text>`;
    }).join('');
  }else if(element.type==='image')shape=`<image x="0" y="0" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet" href="${dataUrl(assets[element.uploadId])}"/>`;
  else{
    const style=`fill="${element.fill}" stroke="${element.stroke}" stroke-width="${element.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`;
    if(element.type==='rect')shape=`<rect x="0" y="0" width="${element.width}" height="${element.height}" rx="${Math.min(element.radius,element.width/2,element.height/2)}" ${style}/>`;
    else if(element.type==='ellipse')shape=`<ellipse cx="${element.width/2}" cy="${element.height/2}" rx="${element.width/2}" ry="${element.height/2}" ${style}/>`;
    else shape=`<path d="${xml(element.d)}" transform="scale(${element.width/element.viewBoxWidth} ${element.height/element.viewBoxHeight})" ${style}/>`;
  }
  return start+shape+'</g>';
}

async function svgPage(document:DesignDocument,page:DesignPage,assets:Record<string,VerifiedAsset>){
  const unique=new Map(page.elements.flatMap(element=>element.type==='text'?[[fontKey(element),element] as const]:[]));
  const css=(await Promise.all([...unique.entries()].map(async([key,element])=>`@font-face{font-family:"${cssFontName(element)}";font-style:normal;font-weight:${element.fontWeight};src:url(data:font/ttf;base64,${Buffer.from(await fontBytes(key)).toString('base64')}) format("truetype")}`))).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" role="img" aria-labelledby="design-title"><title id="design-title">${xml(document.title+' — '+page.name)}</title><defs><style>${css}</style></defs><rect width="${page.width}" height="${page.height}" fill="${page.background}"/>${page.elements.map(element=>svgElement(element,assets)).join('')}</svg>`;
}

const color=(value:string)=>rgb(parseInt(value.slice(1,3),16)/255,parseInt(value.slice(3,5),16)/255,parseInt(value.slice(5,7),16)/255);
function roundedRectangle(width:number,height:number,radius:number){const r=Math.min(radius,width/2,height/2),k=.5522847498;return `M ${r} 0 L ${width-r} 0 C ${width-r+k*r} 0 ${width} ${r-k*r} ${width} ${r} L ${width} ${height-r} C ${width} ${height-r+k*r} ${width-r+k*r} ${height} ${width-r} ${height} L ${r} ${height} C ${r-k*r} ${height} 0 ${height-r+k*r} 0 ${height-r} L 0 ${r} C 0 ${r-k*r} ${r-k*r} 0 ${r} 0 Z`;}
async function pdfPages(document:DesignDocument,pages:DesignPage[],assets:Record<string,VerifiedAsset>){
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(document.title);pdf.setCreator('FiveGen Design Studio');
  const embeddedFonts=new Map<string,PDFFont>(),images=new Map<string,PDFImage>();
  for(const element of pages.flatMap(page=>page.elements)){
    if(element.type==='text'&&!embeddedFonts.has(fontKey(element)))embeddedFonts.set(fontKey(element),await pdf.embedFont(await fontBytes(fontKey(element)),{subset:true}));
    if(element.type==='image'&&!images.has(element.uploadId))images.set(element.uploadId,await pdf.embedPng(assets[element.uploadId].bytes));
  }
  for(const input of pages){
    const page=pdf.addPage([input.width*pixelsToPoints,input.height*pixelsToPoints]);page.drawRectangle({x:0,y:0,width:page.getWidth(),height:page.getHeight(),color:color(input.background)});
    for(const element of input.elements){
      const theta=element.rotation*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),w=element.width,h=element.height,k=pixelsToPoints;
      // SVG rotates clockwise about the box center; PDF uses a bottom-left origin.
      page.pushOperators(pushGraphicsState(),concatTransformationMatrix(c*k,-s*k,s*k,c*k,(element.x+w/2-c*w/2-s*h/2)*k,page.getHeight()-(element.y+h/2)*k+(s*w/2-c*h/2)*k));
      if(element.type==='text'){
        const font=embeddedFonts.get(fontKey(element))!,supported=new Set(font.getCharacterSet());
        for(const character of element.text){const code=character.codePointAt(0)!;if(code>31&&!supported.has(code))throw new DesignExportError(`The print font cannot render U+${code.toString(16).toUpperCase()}. Replace that character before exporting PDF.`);}
        for(const line of layoutDesignText(element)){
          const width=element.fontFamily==='mono'?[...line.text].length*element.fontSize*.62:font.widthOfTextAtSize(line.text,element.fontSize),x=element.align==='center'?(w-width)/2:element.align==='right'?w-width:0;
          if(element.fontFamily==='mono')[...line.text].forEach((character,index)=>page.drawText(character,{x:x+index*element.fontSize*.62,y:h-line.y,font,size:element.fontSize,color:color(element.fill),opacity:element.opacity}));
          else page.drawText(line.text,{x,y:h-line.y,font,size:element.fontSize,color:color(element.fill),opacity:element.opacity});
        }
      }else if(element.type==='image'){
        const image=images.get(element.uploadId)!,scale=Math.min(w/image.width,h/image.height),width=image.width*scale,height=image.height*scale;
        page.drawImage(image,{x:(w-width)/2,y:(h-height)/2,width,height,opacity:element.opacity});
      }
      else{
        const options={color:element.fill==='none'?undefined:color(element.fill),borderColor:element.stroke==='none'||element.strokeWidth===0?undefined:color(element.stroke),borderWidth:element.stroke==='none'?0:element.strokeWidth,opacity:element.opacity,borderOpacity:element.opacity,borderLineCap:LineCapStyle.Round};
        if(options.color||options.borderColor){
          page.pushOperators(setLineJoin(LineJoinStyle.Round));
          if(element.type==='rect'&&!element.radius)page.drawRectangle({x:0,y:0,width:w,height:h,...options});
          else if(element.type==='ellipse')page.drawEllipse({x:w/2,y:h/2,xScale:w/2,yScale:h/2,...options});
          else if(element.type==='rect')page.drawSvgPath(roundedRectangle(w,h,element.radius),{x:0,y:h,...options});
          else{page.pushOperators(pushGraphicsState(),concatTransformationMatrix(w/element.viewBoxWidth,0,0,h/element.viewBoxHeight,0,0));page.drawSvgPath(element.d,{x:0,y:element.viewBoxHeight,...options});page.pushOperators(popGraphicsState());}
        }
      }
      page.pushOperators(popGraphicsState());
    }
  }
  return pdf.save();
}

/** SVG defaults to the first page. PDF exports all pages, or the explicitly selected page. ZIP always contains every page. */
export async function exportDesign(input:DesignDocument,format:DesignExportFormat,assets:DesignExportAssets={},pageId?:string):Promise<{bytes:Uint8Array;mime:string;extension:string}>{
  const document=parse(input);
  if(!['svg','pdf','json','zip'].includes(format))throw new DesignExportError('Choose SVG, PDF, editable JSON or ZIP.');
  const selected=pagesFor(document,pageId);
  if(format==='json')return {bytes:strToU8(JSON.stringify(document)),mime:'application/json',extension:'fivegen.json'};
  const pages=format==='zip'?document.pages:format==='svg'?[selected[0]]:selected,verified=await verifyAssets(pages,assets);
  if(format==='svg')return {bytes:strToU8(await svgPage(document,pages[0],verified)),mime:'image/svg+xml',extension:'svg'};
  if(format==='pdf')return {bytes:await pdfPages(document,pages,verified),mime:'application/pdf',extension:'pdf'};
  const entries:Record<string,Uint8Array>={'design.fivegen.json':strToU8(JSON.stringify(document)),'print.pdf':await pdfPages(document,pages,verified)};
  for(let index=0;index<pages.length;index++)entries[`pages/page-${String(index+1).padStart(2,'0')}.svg`]=strToU8(await svgPage(document,pages[index],verified));
  for(const [id,asset] of Object.entries(verified))entries[`assets/${id}.png`]=asset.bytes;
  entries['README.txt']=strToU8('FiveGen editable design\n\nOpen design.fivegen.json in the FiveGen design editor to keep editing.\nEach SVG is a self-contained vector page with embedded fonts and images.\nprint.pdf contains every page at 96 CSS pixels per inch (0.75 PDF points per pixel).\nassets/ contains the sanitised raster originals referenced by image upload IDs.\n');
  return {bytes:zipSync(entries,{level:6}),mime:'application/zip',extension:'zip'};
}
