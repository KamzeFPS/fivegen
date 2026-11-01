import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStorage} from '../runtime/render/storage.mjs';

// Reuse the isolated runtime/session fixture. It strips real credentials and
// blocks external traffic before starting the actual built application.
process.argv.push('--quiet');
// Install the provider mock before importing the production framework. Vinext
// retains the fetch available during startup, so replacing it afterward is too
// late for requests issued by the built application.
const seedOnly=process.argv.includes('--seed-only');
if(!seedOnly)process.argv.push('--seed-only');
const {info,startDesignPreview}=await import('./design-refresh-preview.mjs');
if(!seedOnly)process.argv.splice(process.argv.indexOf('--seed-only'),1);
const storage=createStorage(info.root),db=storage.sqlite,productId=info.productIds.book;
const row=db.prepare('SELECT owner,data FROM product_builder_workspaces WHERE product_id=?').get(productId),draft=JSON.parse(row.data);
draft.title='The Human-Like Video Handbook';
draft.description='A practical book about planning, creating and improving believable AI videos.';
draft.fields.deliveryMode='both';draft.fields.exportFormat='pdf';
draft.studio={writing:{theme:'editorial',font:'serif',author:'Alex Morgan',showToc:true}};
const titles=['Introduction','Why AI videos look fake','Set up your tools','Write a better brief','Cast believable people','Build a natural scene','Review and improve'];
const example='A skincare creator films a quiet morning routine. Warm window light, a simple bathroom, and a relaxed, natural expression make the scene feel believable.';
const body='A believable video starts before you press generate. It starts with a brief that tells the AI what matters.\n\nThe better your brief, the more natural and useful your video will be. A clear brief helps the AI understand the person, the purpose and the feel you are aiming for.\n\n## Give the scene four clear instructions\n\nEvery good video brief covers four things. Keep these in mind, whatever type of video you are creating.\n\n1. Who is creating the video?\n2. Who will watch it?\n3. What should happen on screen?\n4. What should the finished clip look like?\n\nThese four questions keep your brief focused. A few clear sentences are enough to guide the AI and get a much better result.\n\n'+example+'\n\nThis kind of brief gives the AI useful context. It tells what to show, who it is for and how it should feel. The result is a video that looks natural and relatable.';
draft.sections=titles.map((title,index)=>({id:randomUUID(),title,body:index===3?body:'Start with a real situation and one useful result. Use your own experience to make the example specific.\n\nWrite down what matters to your audience. Keep the next step small enough to try today.\n\nReview what you made, then improve one thing at a time.'}));
draft.files=[{name:'video-brief-worksheet.md',description:'An editable four-part video brief.',content:'# Your video brief\n\nWho creates it?\nWho watches?\nWhat happens?\nWhat format?\n'}];
db.prepare('UPDATE product_builder_workspaces SET data=? WHERE product_id=?').run(JSON.stringify(draft),productId);
db.prepare('UPDATE products SET title=?,description=?,content=? WHERE id=?').run(draft.title,draft.description,JSON.stringify({sections:draft.sections,files:draft.files,benefits:['Practical original examples'],launch:''}),productId);
const delivery={title:draft.title,description:draft.description,format:'Book',builderType:'book',deliveryFamily:'document',sections:draft.sections,files:draft.files,uploadIds:draft.uploadIds,coverUploadId:draft.coverUploadId,studio:draft.studio,meetingUrl:'',intakePrompt:''};
const publicData={title:draft.title,description:draft.description,audience:draft.audience,format:'Book',benefits:[],outline:titles,priceCents:draft.priceCents,currency:draft.currency,hasCover:true};
db.prepare('UPDATE product_builder_publications SET public_snapshot=?,content_snapshot=? WHERE product_id=?').run(JSON.stringify(publicData),JSON.stringify(delivery),productId);
db.prepare('UPDATE product_builder_order_snapshots SET snapshot=? WHERE order_id=?').run(JSON.stringify(delivery),info.orderIds.book);
db.prepare('UPDATE commerce_orders SET title=? WHERE id=?').run(draft.title,info.orderIds.book);
storage.close();

const fakeKey='synthetic-book-preview-not-a-real-provider-key';
process.env.OPENAI_API_KEY=fakeKey;
const localFetch=globalThis.fetch;
let imageCalls=0;
const diagnostic=(phase,details={})=>writeFileSync(resolve(info.root,'mock-image-diagnostics.json'),JSON.stringify({synthetic:true,phase,...details}));
export async function bookImageMock(input,init){
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)),credentialMatches=headers.get('Authorization')==='Bearer '+fakeKey;
 diagnostic('entered',{credentialMatches});
 // Do not use assert.equal here: assertion output could echo an unexpected
 // credential. The mock records only whether the synthetic key matched.
 if(!credentialMatches){diagnostic('rejected-credential',{credentialMatches:false});throw new Error('Synthetic image preview received an unexpected credential; external traffic remains blocked.');}
 let phase='reading-request';
 try{
  const requestBody=init?.body??(input instanceof Request?await input.clone().text():''),value=JSON.parse(typeof requestBody==='string'?requestBody:new TextDecoder().decode(requestBody)),[width,height]=String(value.size).split('x').map(Number);
  const allowedSize=['1024x1024','1536x1024','1024x1536'].includes(value.size),allowedQuality=['low','medium','high'].includes(value.quality);
  diagnostic('request-validated',{modelMatches:value.model==='gpt-image-2',countMatches:value.n===1,allowedSize,allowedQuality,size:allowedSize?value.size:'unsupported',quality:allowedQuality?value.quality:'unsupported'});
  assert.equal(value.model,'gpt-image-2');assert.equal(value.n,1);assert.ok(allowedSize&&allowedQuality);assert.equal(value.output_format,'png');
  phase='loading-local-image';
  const preferred=resolve(process.env.FIVEGEN_BOOK_QA_IMAGE||'outputs/book-interface-preview/skincare-illustration.png'),usePreferred=!process.argv.includes('--test-image-fallback')&&existsSync(preferred),qaImage=usePreferred?preferred:resolve('public/studio/dunes.webp');
  const {createCanvas,loadImage}=await import('@napi-rs/canvas'),source=await loadImage(readFileSync(qaImage)),canvas=createCanvas(width,height);
  phase='resizing-local-image';canvas.getContext('2d').drawImage(source,0,0,width,height);
  const png=canvas.toBuffer('image/png');imageCalls++;
  writeFileSync(resolve(info.root,'mock-image-calls.json'),JSON.stringify({synthetic:true,imageCalls,quality:value.quality,size:value.size}));
  diagnostic('completed',{imageCalls,width,height,pngBytes:png.length,source:usePreferred?'local-qa-photo':'tracked-qa-fallback'});
  return Response.json({data:[{b64_json:png.toString('base64')}],output_format:'png',background:value.background});
 }catch(error){diagnostic('failed',{phase});throw error;}
}
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin==='https://api.openai.com'&&url.pathname==='/v1/images/generations')return bookImageMock(input,init);
 return localFetch(input,init);
};
if(process.argv.includes('--test-image-mock')){
 const response=await bookImageMock('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+fakeKey},body:JSON.stringify({model:'gpt-image-2',n:1,quality:'medium',size:'1536x1024',background:'opaque',output_format:'png'})}),payload=await response.json(),bytes=Buffer.from(payload.data[0].b64_json,'base64');
 assert.equal(bytes.readUInt32BE(16),1536);assert.equal(bytes.readUInt32BE(20),1024);assert.ok(bytes.length>0&&bytes.length<8_000_000);writeFileSync(resolve(info.root,'mock-image-selftest.json'),JSON.stringify({synthetic:true,passed:true,width:1536,height:1024,pngBytes:bytes.length}));
}
export const bookInfo={...info,bookURL:info.bookURL+'?area=content',bookReaderURL:info.customerURLs.book,example,note:'Isolated Book UI preview. All identities, orders and credit balances are synthetic. Only the image response is mocked from a local QA photo; no provider or payment traffic leaves this process.'};
writeFileSync(resolve(info.root,'book-preview-info.json'),JSON.stringify(bookInfo,null,2));
if(!seedOnly)await startDesignPreview();
if(!process.argv.includes('--guide-preview'))console.log(JSON.stringify({root:bookInfo.root,entryURL:bookInfo.entryURL,bookURL:bookInfo.bookURL,bookReaderURL:bookInfo.bookReaderURL,note:bookInfo.note}));
