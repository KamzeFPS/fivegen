import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {unzipSync,strFromU8} from 'fflate';
import {PDFDocument,PDFName,PDFHexString,decodePDFRawStream} from 'pdf-lib';

const root=resolve('outputs/book-manuscript-tests',randomUUID());mkdirSync(root,{recursive:true});
for(const file of ['book-manuscript','export','product-decision-contract','product-document-archive','product-studio-markdown','product-studio-export']){
 const code=ts.transpileModule(readFileSync(`lib/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");writeFileSync(resolve(root,file+'.mjs'),code);
}
const manuscript=await import(pathToFileURL(resolve(root,'book-manuscript.mjs'))),{createStudioExport}=await import(pathToFileURL(resolve(root,'product-studio-export.mjs'))),{renderStudioMarkdown}=await import(pathToFileURL(resolve(root,'product-studio-markdown.mjs')));
const {parseBookBlocks,bookImageMarkdown,insertBookImage,moveBookImage,updateBookImage,removeBookImage}=manuscript;
const image={uploadId:randomUUID(),alt:'A clear [diagram] \\ with "labels"',caption:'Figure 1: A "useful" path & outcome.'};
const body='  First paragraph stays **bold**.\r\n\r\nSecond paragraph has a selected passage.\r\nIt also has a second line.\r\n\r\n- First task\r\n- Second task\r\n\r\n```md\r\n![literal example](upload:'+randomUUID()+')\r\n```\r\n\r\nFinal paragraph: Монгол хэл.  ';
const textBlocks=value=>parseBookBlocks(value).filter(block=>block.kind==='text').map(block=>block.source);
const selection={start:body.indexOf('selected passage'),end:body.indexOf('selected passage')+'selected passage'.length,text:'selected passage'};
const inserted=insertBookImage(body,selection,image),blocks=parseBookBlocks(inserted),picture=blocks.find(block=>block.kind==='image');
assert.ok(picture);assert.deepEqual(picture.image,image);assert.equal(picture.source,bookImageMarkdown(image));assert.equal(inserted.slice(picture.start,picture.end),picture.source);
assert.ok(inserted.indexOf(bookImageMarkdown(image))>inserted.indexOf('It also has a second line.'),'The image is inserted after the complete selected paragraph');
assert.deepEqual(textBlocks(inserted),textBlocks(body),'Insertion keeps every original text block exactly, including code examples and CRLF');
assert.equal(blocks.filter(block=>block.kind==='image').length,1,'A fenced image example stays written content');
assert.equal(parseBookBlocks('Use `'+bookImageMarkdown(image)+'` as the example.').filter(block=>block.kind==='image').length,0,'An inline code example stays written content');
assert.throws(()=>insertBookImage(body,{...selection,text:'stale text'},image),/selected passage changed/);
assert.throws(()=>insertBookImage(body,{start:-1,end:0,text:''},image),/selected passage changed/);
assert.throws(()=>bookImageMarkdown({...image,uploadId:'https://external.test/image.png'}),/saved image/);
for(const direction of ['up','down',0,blocks.length-1]){
 const moved=moveBookImage(inserted,picture.id,direction);assert.deepEqual(textBlocks(moved),textBlocks(body));assert.equal(parseBookBlocks(moved).find(block=>block.kind==='image').id,picture.id,'The image ID survives reordering');assert.equal(parseBookBlocks(moved).filter(block=>block.kind==='image').length,1);
}
assert.equal(parseBookBlocks(moveBookImage(inserted,picture.id,0))[0].kind,'image');
assert.equal(parseBookBlocks(moveBookImage(inserted,picture.id,blocks.length-1)).at(-1).kind,'image');
const changed={...image,alt:'Accessible diagram',caption:'A revised caption'};assert.deepEqual(parseBookBlocks(updateBookImage(inserted,picture.id,changed)).find(block=>block.kind==='image').image,changed);
assert.deepEqual(textBlocks(removeBookImage(inserted,picture.id)),textBlocks(body));assert.throws(()=>removeBookImage(body,picture.id),/image changed/);
assert.equal(parseBookBlocks('')[0],undefined);assert.equal(parseBookBlocks(insertBookImage('',{start:0,end:0,text:''},image))[0].kind,'image');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvxoAAAAASUVORK5CYII=','base64'),doc={title:'A finished illustrated book',description:'A practical illustrated manuscript with complete written instructions.',audience:'Creators',language:'en',writing:{showToc:false},sections:[{title:'A real chapter',body:'Before the illustration.\n\n'+bookImageMarkdown(image)+'\n\nAfter the illustration.'}],files:[],originals:[],images:{[image.uploadId]:{name:'diagram.png',mime:'image/png',bytes:png}}};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No external fetch is allowed.');};
try{
 const html=strFromU8((await createStudioExport(doc,'html')).bytes);assert.match(html,/data:image\/png;base64/);assert.match(html,/alt="A clear \[diagram\] \\ with &quot;labels&quot;"/);assert.match(html,/<figcaption>Figure 1: A &quot;useful&quot; path &amp; outcome\.<\/figcaption>/);assert.ok(html.includes('Before the illustration.')&&html.includes('After the illustration.'));assert.doesNotMatch(renderStudioMarkdown(bookImageMarkdown(image),{[image.uploadId]:'https://external.test/image.png'}),/<img/,'Caller mappings cannot introduce remote image fetches');
 assert.doesNotMatch(renderStudioMarkdown('```md\n'+bookImageMarkdown(image)+'\n```\n\nUse `'+bookImageMarkdown(image)+'` as text.'),/<img/,'Image syntax inside code remains visible code, rather than loading an image');
 const epub=await createStudioExport(doc,'epub'),entries=unzipSync(epub.bytes),chapter=strFromU8(entries['OEBPS/chapter-1.xhtml']);assert.deepEqual(entries['OEBPS/images/image-1.png'],new Uint8Array(png));assert.match(chapter,/<figcaption>Figure 1:/);assert.match(chapter,/alt="A clear \[diagram\]/);assert.ok(chapter.includes('Before the illustration.')&&chapter.includes('After the illustration.'));
 const pdf=await createStudioExport(doc,'pdf'),opened=await PDFDocument.load(pdf.bytes);writeFileSync(resolve(root,'illustrated-book.pdf'),pdf.bytes);
 const streams=opened.getPages().flatMap(page=>{const contents=page.node.lookup(PDFName.of('Contents'));return Array.from({length:contents.size()},(_,index)=>new TextDecoder().decode(decodePDFRawStream(contents.lookup(index)).decode()));}).join('\n');
 assert.ok(streams.includes('/Figure')&&streams.includes('/Alt '+PDFHexString.fromText(image.alt).toString()),'PDF figure metadata retains the alternative text');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:pdf.bytes.slice(),useSystemFonts:false}),parsed=await task.promise;let text='',imageCount=0;
 for(let page=1;page<=parsed.numPages;page++){const current=await parsed.getPage(page);text+=(await current.getTextContent()).items.map(item=>item.str||'').join(' ')+'\n';imageCount+=(await current.getOperatorList()).fnArray.filter(value=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(value)).length;}
 assert.ok(text.includes(image.caption),'PDF has the authored visible caption');assert.ok(text.includes('Before the illustration.')&&text.includes('After the illustration.'));assert.equal(imageCount,1,'PDF contains the actual raster illustration');await task.destroy();
 console.log('Book manuscript passed: exact stale-selection checks, paragraph insertion, stable image IDs, text-preserving moves/removal, escaped captions/alt, and actual HTML/EPUB/PDF image roundtrips. '+root);
}finally{globalThis.fetch=originalFetch;}
