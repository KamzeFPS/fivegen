import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {unzipSync,strFromU8} from 'fflate';
import {PDFDocument} from 'pdf-lib';
import {createCanvas} from '@napi-rs/canvas';

const output=resolve('outputs/design-export-qa',randomUUID());mkdirSync(output,{recursive:true});
for(const file of ['design-document','design-text-layout','design-templates','design-export']){
  const source=readFileSync(`lib/${file}.ts`,'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
  writeFileSync(resolve(output,file+'.mjs'),code);
}
const {designDocumentSchema,designElement,blankDesign}=await import(pathToFileURL(resolve(output,'design-document.mjs'))),{designTemplates,createDesignFromTemplate}=await import(pathToFileURL(resolve(output,'design-templates.mjs'))),{exportDesign}=await import(pathToFileURL(resolve(output,'design-export.mjs')));
const parser=new XMLParser({ignoreAttributes:false,processEntities:true}),originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw new Error('Design exports must never request remote resources.');};
try{
  assert.equal(designTemplates.length,9);
  for(const template of designTemplates){
    const design=createDesignFromTemplate(template.id);designDocumentSchema.parse(design);assert.equal(design.pages.length,template.pageCount);
    assert.ok(design.pages.every(page=>page.elements.every(element=>element.type!=='image')),'All starter artwork remains independently editable vector elements.');
    const fresh=createDesignFromTemplate(template.id);assert.notEqual(fresh.pages[0].id,design.pages[0].id);design.pages[0].name='Changed';assert.notEqual(fresh.pages[0].name,'Changed');
    const svg=await exportDesign(fresh,'svg'),xml=strFromU8(svg.bytes);assert.equal(XMLValidator.validate(xml),true);const parsed=parser.parse(xml).svg;
    assert.equal(Number(parsed['@_width']),fresh.pages[0].width);assert.equal(Number(parsed['@_height']),fresh.pages[0].height);assert.ok(!/href="(?:https?:|\/\/)|<script|<foreignObject|\bon[a-z]+=/i.test(xml));
    if(fresh.pages[0].elements.some(element=>element.type==='text'))assert.match(xml,/data:font\/ttf;base64,/,'SVG embeds its actual print font.');
    const json=await exportDesign(fresh,'json');assert.deepEqual(JSON.parse(strFromU8(json.bytes)),fresh);assert.equal(json.extension,'fivegen.json');
    const pdf=await exportDesign(fresh,'pdf');writeFileSync(resolve(output,template.id+'.pdf'),pdf.bytes);const reopened=await PDFDocument.load(pdf.bytes);assert.equal(reopened.getPageCount(),template.pageCount);
    reopened.getPages().forEach((page,index)=>{assert.equal(page.getWidth(),fresh.pages[index].width*.75);assert.equal(page.getHeight(),fresh.pages[index].height*.75);});
  }
  assert.throws(()=>createDesignFromTemplate('remote-template'),/available design template/);
  let nearLimit=blankDesign();
  for(let index=0;index<50;index++){const trial=structuredClone(nearLimit);trial.pages[0].elements.push(designElement('text',{text:'x'.repeat(5900)}));if(!designDocumentSchema.safeParse(trial).success)break;nearLimit=trial;}
  const nearLimitJson=await exportDesign(nearLimit,'json');assert.ok(nearLimitJson.bytes.length>230000);assert.ok(nearLimitJson.bytes.length<=240000,'A valid near-limit design remains within the editor’s file import limit when exported.');designDocumentSchema.parse(JSON.parse(strFromU8(nearLimitJson.bytes)));

  const woodland=createDesignFromTemplate('woodland-colouring'),all=await exportDesign(woodland,'zip',{},woodland.pages[1].id),archive=unzipSync(all.bytes);
  assert.ok(archive['design.fivegen.json']);assert.ok(archive['print.pdf']);assert.equal(Object.keys(archive).filter(name=>name.endsWith('.svg')).length,3,'A ZIP includes every page even when a page is selected in the editor.');
  assert.equal((await PDFDocument.load(archive['print.pdf'])).getPageCount(),3);assert.deepEqual(JSON.parse(strFromU8(archive['design.fivegen.json'])),woodland);
  for(const [name,bytes] of Object.entries(archive))if(name.endsWith('.svg')){assert.equal(XMLValidator.validate(strFromU8(bytes)),true);assert.match(strFromU8(bytes),/<path /);}
  const selected=await exportDesign(woodland,'svg',{},woodland.pages[1].id);assert.match(strFromU8(selected.bytes),/Mushroom meadow/);assert.doesNotMatch(strFromU8(selected.bytes),/The woodland fox/);
  const selectedPdf=await exportDesign(woodland,'pdf',{},woodland.pages[1].id);assert.equal((await PDFDocument.load(selectedPdf.bytes)).getPageCount(),1);
  await assert.rejects(exportDesign(woodland,'svg',{},'missing-page'),/no longer exists/);

  const custom=blankDesign(),assetId=randomUUID();custom.title='<script>alert("title")</script>';
  const text=designElement('text',{x:35,y:38,width:700,height:150,text:'Монгол хэл — бүтээлч өдөр\n<svg onload="alert(1)">& hello',fontSize:24,fontFamily:'sans',rotation:8,opacity:.6});
  custom.pages[0].elements=[text,designElement('path',{x:50,y:270,width:350,height:180,viewBoxWidth:100,viewBoxHeight:100,d:'M 0 0 L 100 0 Q 50 100 0 0 Z',fill:'#ff804a',stroke:'#202020',rotation:23,opacity:.5}),designElement('image',{x:470,y:270,width:120,height:100,uploadId:assetId})];
  const canvas=createCanvas(10,10),context=canvas.getContext('2d');context.fillStyle='#43a680';context.fillRect(0,0,10,10);const png=canvas.toBuffer('image/png'),assets={[assetId]:{mime:'image/png',bytes:png}};
  const safeSvg=strFromU8((await exportDesign(custom,'svg',assets)).bytes);assert.equal(XMLValidator.validate(safeSvg),true);assert.match(safeSvg,/&lt;script&gt;/);assert.doesNotMatch(safeSvg,/<script|<svg onload|href="https/i);assert.match(safeSvg,/transform="scale\(3\.5 1\.8\)"/);assert.match(safeSvg,/data:image\/png;base64,/);assert.match(safeSvg,/opacity="0\.5"/);
  const customPdf=await exportDesign(custom,'pdf',assets);writeFileSync(resolve(output,'unicode-geometry.pdf'),customPdf.bytes);
  const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:customPdf.bytes.slice(),useSystemFonts:false}),pdf=await task.promise,page=await pdf.getPage(1),content=await page.getTextContent();
  assert.match(content.items.map(item=>item.str||'').join(' '),/Монгол хэл/,'Mongolian text is actual readable Unicode PDF text.');
  const operators=await page.getOperatorList();assert.ok(operators.fnArray.includes(OPS.constructPath),'PDF retains vector paths.');assert.ok(operators.fnArray.includes(OPS.paintImageXObject),'PDF contains the supplied raster image.');assert.ok(operators.fnArray.includes(OPS.setGState),'PDF retains transparency.');
  const viewport=page.getViewport({scale:1}),preview=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas:preview,canvasContext:preview.getContext('2d'),viewport}).promise;
  const pixels=preview.getContext('2d');assert.ok(pixels.getImageData(355,220,1,1).data[0]>240,'A square image retains its aspect ratio inside a wider image box.');assert.ok(pixels.getImageData(380,220,1,1).data[0]<100,'The supplied raster is visibly painted at the centre of its bounds.');
  writeFileSync(resolve(output,'unicode-geometry.png'),preview.toBuffer('image/png'));await task.destroy();
  const imageZip=unzipSync((await exportDesign(custom,'zip',assets)).bytes);assert.ok(imageZip[`assets/${assetId}.png`]);assert.equal(XMLValidator.validate(strFromU8(imageZip['pages/page-01.svg'])),true);
  for(const mime of ['image/jpeg','image/webp']){const raster=canvas.toBuffer(mime),svg=strFromU8((await exportDesign(custom,'svg',{[assetId]:{mime,bytes:raster}})).bytes);assert.match(svg,/data:image\/png;base64,/,'JPEG and WebP safely become self-contained sanitised PNG assets.');}

  await assert.rejects(exportDesign(custom,'svg'),/image is unavailable/i);
  await assert.rejects(exportDesign(custom,'svg',{[assetId]:{mime:'image/svg+xml',bytes:Buffer.from('<svg onload="alert(1)"></svg>')}}),/raster files/);
  await assert.rejects(exportDesign(custom,'svg',{[assetId]:{mime:'image/png',bytes:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')}}),/does not match/);
  await assert.rejects(exportDesign(custom,'svg',{[assetId]:{mime:'image/png',bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)])}}),/decoded safely/);
  const oversized=Buffer.from(png);oversized.writeUInt32BE(99999,16);oversized.writeUInt32BE(99999,20);await assert.rejects(exportDesign(custom,'svg',{[assetId]:{mime:'image/png',bytes:oversized}}),/megapixels/,'Oversized raster headers are rejected before image allocation.');
  const injected=structuredClone(custom);injected.pages[0].elements[1].d='M 0 0 L 10 10"/><script>alert(1)</script>';await assert.rejects(exportDesign(injected,'svg',assets),/invalid/);
  const invalidPaint=structuredClone(custom);invalidPaint.pages[0].elements[1].fill='url(https://example.test/x)';await assert.rejects(exportDesign(invalidPaint,'svg',assets),/invalid/);
  const unsupported=blankDesign();unsupported.pages[0].elements=[designElement('text',{text:'😀'})];await assert.rejects(exportDesign(unsupported,'pdf'),/print font cannot render/);
  console.log(`Design exports passed: all 9 editable starters; actual SVG/XML/JSON/ZIP round trips; all PDF page sizes/counts; Unicode PDF text, vector geometry, raster embedding and transparency; offline exports and malformed/active asset rejection. Visual fixtures: ${output}`);
}finally{globalThis.fetch=originalFetch;}
