import {workspaceAttachmentLimits,type WorkspaceAttachment} from './workspace-attachments';

/** Browser-local files remain local until the creator sends the message. */
export type WorkspaceDraftAttachment={id:string;file:File;uploaded?:WorkspaceAttachment};
export type WorkspaceAttachmentDraft={message:string;files:WorkspaceDraftAttachment[];task?:string;productKind?:string;uploadRequest?:{id:string;fileIds:string[]};missingFiles?:boolean;sourceKey?:string;updatedAt:number};
const fallbackPrefix='fivegen:attachment-draft:';
const databaseName='fivegen-workspace-drafts',storeName='attachments';
const memory=new Map<string,WorkspaceAttachmentDraft>(),volatile=new Set<string>(),writes=new Map<string,Promise<unknown>>();
let opening:Promise<IDBDatabase>|null=null;
export function workspaceAttachmentDraftKey(scope:string,conversationId?:string|null){return `chat:${scope.trim().toLowerCase()||'guest'}:${conversationId||'new'}`;}
function fallback(key:string){try{const value=JSON.parse(sessionStorage.getItem(fallbackPrefix+key)||'null');return value&&typeof value.message==='string'?{...value,files:[]} as WorkspaceAttachmentDraft:null;}catch{return null;}}
function database(){
 if(!opening)opening=new Promise<IDBDatabase>((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Local file storage is unavailable.'));return;}
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName);};
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
  request.onerror=()=>reject(request.error||new Error('Local file storage is unavailable.'));
  request.onblocked=()=>reject(new Error('Local file storage is busy in another tab.'));
 }).catch(error=>{opening=null;throw error;});
 return opening;
}
function serialize(key:string,work:()=>Promise<unknown>){const previous=writes.get(key)||Promise.resolve(),next=previous.catch(()=>{}).then(work);writes.set(key,next);void next.finally(()=>{if(writes.get(key)===next)writes.delete(key);}).catch(()=>{});return next;}
function fileMime(file:File){const extension=file.name.split('.').at(-1)?.toLowerCase(),mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'};return extension&&mime[extension]||'';}
export function addWorkspaceDraftFiles(existing:WorkspaceDraftAttachment[],selected:File[]){
 const files=[...existing];
 for(const file of selected){
  if(!fileMime(file))return {files:existing,error:'Choose PNG, JPEG, WebP, PDF, DOCX, or TXT files.'};
  if(!file.size||file.size>workspaceAttachmentLimits.fileBytes)return {files:existing,error:'Choose files up to 8 MB each.'};
  if(files.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
  files.push({id:crypto.randomUUID(),file});
 }
 if(files.length>workspaceAttachmentLimits.files)return {files:existing,error:'Attach up to 4 files per message.'};
 if(files.reduce((sum,item)=>sum+item.file.size,0)>workspaceAttachmentLimits.totalBytes)return {files:existing,error:'Keep the attached files under 20 MB combined.'};
 return {files,error:''};
}
export async function readWorkspaceAttachmentDraft(key:string):Promise<WorkspaceAttachmentDraft|null>{
 await writes.get(key)?.catch(()=>{});
 try{const db=await database();return await new Promise<WorkspaceAttachmentDraft|null>((resolve,reject)=>{const request=db.transaction(storeName,'readonly').objectStore(storeName).get(key);request.onsuccess=()=>{const draft=request.result as WorkspaceAttachmentDraft|undefined;if(!draft||!Array.isArray(draft.files))return resolve(volatile.has(key)?memory.get(key)||fallback(key):fallback(key));memory.set(key,draft);resolve(draft);};request.onerror=()=>reject(request.error);});}catch{return memory.get(key)||fallback(key);}
}
/** False means the files survive in this tab only; callers must not navigate away. */
export async function writeWorkspaceAttachmentDraft(key:string,draft:WorkspaceAttachmentDraft):Promise<boolean>{
 memory.set(key,draft);
 try{sessionStorage.setItem(fallbackPrefix+key,JSON.stringify({message:draft.message,task:draft.task,productKind:draft.productKind,sourceKey:draft.sourceKey,updatedAt:draft.updatedAt,missingFiles:!!draft.files.length}));}catch{}
 return await serialize(key,async()=>{try{const db=await database();await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(storeName,'readwrite');transaction.objectStore(storeName).put(draft,key);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});volatile.delete(key);return true;}catch{volatile.add(key);return false;}}) as boolean;
}
export async function deleteWorkspaceAttachmentDraft(key:string){
 memory.delete(key);volatile.delete(key);try{sessionStorage.removeItem(fallbackPrefix+key);}catch{}
 await serialize(key,async()=>{try{const db=await database();await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(storeName,'readwrite');transaction.objectStore(storeName).delete(key);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}catch{}});
}
export async function moveWorkspaceAttachmentDraft(from:string,to:string){
 if(from===to)return true;const draft=await readWorkspaceAttachmentDraft(from);if(!draft)return true;
 const persisted=await writeWorkspaceAttachmentDraft(to,{...draft,sourceKey:from});if(persisted)await deleteWorkspaceAttachmentDraft(from);return persisted;
}
export async function clearWorkspaceAttachmentDrafts(){
 memory.clear();volatile.clear();try{for(const key of Array.from({length:sessionStorage.length},(_,index)=>sessionStorage.key(index)))if(key?.startsWith(fallbackPrefix))sessionStorage.removeItem(key);}catch{}await Promise.allSettled([...writes.values()]);
 try{const db=await database();await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(storeName,'readwrite');transaction.objectStore(storeName).clear();transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}catch{}
}
