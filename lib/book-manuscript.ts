/** The manuscript remains ordinary Markdown. These blocks are an editing view,
 * not a second copy of the book or a source of asset permissions. */
export type BookImage={uploadId:string;alt:string;caption:string};
export type BookBlock={id:string;kind:'text'|'image';source:string;start:number;end:number;image?:BookImage};
export type BookSelection={start:number;end:number;text:string};

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const imagePattern=()=>/!\[((?:\\.|[^\]\\\r\n])*)\]\(upload:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:[ \t]+"((?:\\.|[^"\\\r\n])*)")?[ \t]*\)/gi;
const unescape=(value:string)=>value.replace(/\\([\\\[\]"])/g,'$1');
function hash(source:string){let result=2166136261;for(let index=0;index<source.length;index++){result^=source.charCodeAt(index);result=Math.imul(result,16777619);}return (result>>>0).toString(36);}

export function bookImageMarkdown(image:BookImage){
 if(!uuid.test(image.uploadId))throw new Error('Choose a saved image from this product.');
 const alt=String(image.alt||'').replace(/\r?\n/g,' ').replace(/[\\\[\]]/g,'\\$&');
 const caption=String(image.caption||'').replace(/\r?\n/g,' ').replace(/[\\"]/g,'\\$&');
 return `![${alt}](upload:${image.uploadId.toLowerCase()}${caption?' "'+caption+'"':''})`;
}

export function parseBookBlocks(body:string):BookBlock[]{
 const blocks:BookBlock[]=[],counts=new Map<string,number>();
 const push=(start:number,end:number,image?:BookImage)=>{
  while(start<end&&/\s/.test(body[start]))start++;
  while(end>start&&/\s/.test(body[end-1]))end--;
  if(start===end)return;
  const source=body.slice(start,end),key=image?'image:'+image.uploadId:'text:'+hash(source),occurrence=counts.get(key)||0;
  counts.set(key,occurrence+1);blocks.push({id:key+':'+occurrence,kind:image?'image':'text',source,start,end,...(image?{image}:{})});
 };
 const paragraph=(start:number,end:number,code=false)=>{
  if(code){push(start,end);return;}
  let cursor=start;const source=body.slice(start,end),inlineCode=[...source.matchAll(/(`+)[^\r\n]*?\1/g)].map(match=>({start:match.index!,end:match.index!+match[0].length}));
  for(const match of source.matchAll(imagePattern())){
   // Escaped image examples stay written text.
   const position=start+match.index!;let escapes=0;for(let index=position-1;index>=start&&body[index]==='\\';index--)escapes++;
   if(escapes%2||inlineCode.some(range=>match.index!>=range.start&&match.index!<range.end))continue;
   push(cursor,position);push(position,position+match[0].length,{uploadId:match[2].toLowerCase(),alt:unescape(match[1]),caption:unescape(match[3]||'')});cursor=position+match[0].length;
  }
  push(cursor,end);
 };
 let start=0,fence='',code=false;
 for(const match of body.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)){
  if(!match[0])continue;
  const line=match[0].replace(/[\r\n]+$/,''),marker=/^ {0,3}(`{3,}|~{3,})/.exec(line);
  if(marker){if(!fence){if(match.index!>start)paragraph(start,match.index!);start=match.index!;fence=marker[1];code=true;}else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length){paragraph(start,match.index!+match[0].length,true);start=match.index!+match[0].length;fence='';code=false;}continue;}
  if(!fence&&!line.trim()){paragraph(start,match.index!);start=match.index!+match[0].length;}
 }
 paragraph(start,body.length,code);return blocks;
}

function selectedImage(body:string,id:string){const blocks=parseBookBlocks(body),index=blocks.findIndex(block=>block.id===id&&block.kind==='image');if(index<0)throw new Error('This image changed. Select it again before editing.');return {blocks,index,block:blocks[index]};}
export function insertBookImage(body:string,selection:BookSelection,image:BookImage){
 if(!Number.isSafeInteger(selection.start)||!Number.isSafeInteger(selection.end)||selection.start<0||selection.end<selection.start||selection.end>body.length||body.slice(selection.start,selection.end)!==selection.text)throw new Error('The selected passage changed. Select the text again before inserting the image.');
 const blocks=parseBookBlocks(body),position=selection.end>selection.start?selection.end-1:selection.start;
 const containing=blocks.find(block=>position>=block.start&&position<block.end)||blocks.find(block=>block.start>=position)||blocks.at(-1);
 const end=containing?.end??body.length,before=body.slice(0,end),after=body.slice(end);
 return before+(before&&!/(?:\r?\n)[ \t]*(?:\r?\n)$/.test(before)?'\n\n':'')+bookImageMarkdown(image)+(after&&!/^(?:\r?\n)[ \t]*(?:\r?\n)/.test(after)?'\n\n':'')+after;
}
export function moveBookImage(body:string,id:string,direction:'up'|'down'|number){
 const {blocks,index}=selectedImage(body,id);if(typeof direction==='number'&&!Number.isSafeInteger(direction))throw new Error('Choose a valid image position.');
 const target=Math.max(0,Math.min(blocks.length-1,typeof direction==='number'?direction:index+(direction==='up'?-1:1)));if(target===index)return body;
 const ordered=[...blocks],image=ordered.splice(index,1)[0];ordered.splice(target,0,image);
 let result=body.slice(0,blocks[0].start)+ordered[0].source;
 for(let position=1;position<ordered.length;position++){let gap=body.slice(blocks[position-1].end,blocks[position].start);if((ordered[position-1].kind==='image'||ordered[position].kind==='image')&&!/(?:\r?\n)[ \t]*(?:\r?\n)/.test(gap))gap='\n\n';result+=gap+ordered[position].source;}
 return result+body.slice(blocks.at(-1)!.end);
}
export function updateBookImage(body:string,id:string,image:BookImage){const {block}=selectedImage(body,id);return body.slice(0,block.start)+bookImageMarkdown(image)+body.slice(block.end);}
export function removeBookImage(body:string,id:string){const {block}=selectedImage(body,id);return body.slice(0,block.start)+body.slice(block.end);}
