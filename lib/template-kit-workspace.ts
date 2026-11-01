/** Template assignments select existing, authorized resources. They do not
 * grant file access, replace uploaded bytes or manufacture source-app links. */
export type TemplateKitItem={
 id:string;name:string;description:string;useCase:string;software:string;imageUrl:string;duplicateUrl:string;
 blankUploadId:string;exampleUploadId:string;blankFileName:string;exampleFileName:string;steps:string[];
 [key:string]:unknown;
};
export type TemplateKitUpload={id:string;name:string;mime:string;size:number};
export type TemplateKitFile={name:string;description?:string;content?:string};
export type TemplateKitContent={downloads?:TemplateKitUpload[];files:TemplateKitFile[]};
export type TemplateKitResource=({kind:'upload'}&TemplateKitUpload)|({kind:'authored'}&TemplateKitFile);
const text=(value:unknown)=>typeof value==='string'?value:'';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function templateKitItems(value:unknown):TemplateKitItem[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();
 return value.flatMap((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return [];
  const row=item as Record<string,unknown>;let id=text(row.id).trim()||`template-${index}`;
  if(seen.has(id))id=`template-${index}`;while(seen.has(id))id+='-';seen.add(id);
  // Empty editor rows and deliberate empty instruction lines remain editable.
  // The reader decides which unfinished rows to display.
  return [{...row,id,name:text(row.name),description:text(row.description),useCase:text(row.useCase),software:text(row.software),imageUrl:text(row.imageUrl),duplicateUrl:text(row.duplicateUrl),blankUploadId:text(row.blankUploadId),exampleUploadId:text(row.exampleUploadId),blankFileName:text(row.blankFileName),exampleFileName:text(row.exampleFileName),steps:Array.isArray(row.steps)?row.steps.filter((step):step is string=>typeof step==='string'):[]}];
 });
}

export function templateKitVariant(content:TemplateKitContent,item:TemplateKitItem,variant:'blank'|'example'):TemplateKitResource|null{
 const uploadId=item[variant==='blank'?'blankUploadId':'exampleUploadId'];
 if(uploadId){
  if(!uuid.test(uploadId))return null;
  const file=content.downloads?.find(resource=>resource.id===uploadId);
  return file?{kind:'upload',id:file.id,name:file.name,mime:file.mime,size:file.size}:null;
 }
 const name=item[variant==='blank'?'blankFileName':'exampleFileName'];if(!name)return null;
 const file=content.files.find(resource=>resource.name===name);
 return file?{kind:'authored',name:file.name,...(typeof file.description==='string'?{description:file.description}:{}),...(typeof file.content==='string'?{content:file.content}:{})}:null;
}

export function templateKitResourceHref(contentId:string,resource:TemplateKitResource,preview=false):string|null{
 if(resource.kind==='upload')return uuid.test(resource.id)?preview?`/api/uploads/${encodeURIComponent(resource.id)}?download=1`:`/api/commerce/customer/${encodeURIComponent(contentId)}/uploads/${encodeURIComponent(resource.id)}`:null;
 return !preview&&resource.name?`/api/commerce/customer/${encodeURIComponent(contentId)}/files/${encodeURIComponent(resource.name)}`:null;
}

export function templateKitDuplicateUrl(value:unknown){
 if(typeof value!=='string'||!value)return '';
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

export function templateKitImageUrl(content:TemplateKitContent&{id:string},value:unknown,preview=false){
 if(typeof value!=='string'||!value)return '';
 const match=/^(?:\/api\/uploads\/|upload:)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(value);
 if(match){
  const file=content.downloads?.find(resource=>resource.id===match[1]);
  return file&&['image/png','image/jpeg','image/webp'].includes(file.mime)?preview?`/api/uploads/${encodeURIComponent(file.id)}`:`/api/commerce/customer/${encodeURIComponent(content.id)}/uploads/${encodeURIComponent(file.id)}?inline=1`:'';
 }
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&/\.(?:png|jpe?g|webp)$/i.test(url.pathname)?url.href:'';}catch{return '';}
}
