/** Draft saves only. Publishing, sending, billing and approval are separate actions. */
export type EditorSaveEntry={label:string;dirty:boolean;busy:boolean;save:()=>Promise<boolean>;priority?:number;manualReview?:string;discard?:()=>void};
export type EditorSaveResult={ok:true}|{ok:false;label:string;message:string};
export function createEditorSaveRegistry(){
 const entries=new Map<symbol,()=>EditorSaveEntry>();let saving=false;
 const snapshot=()=>[...entries.values()].map(read=>read());
 return {
  register(key:symbol,read:()=>EditorSaveEntry){entries.set(key,read);return()=>{entries.delete(key);};},
  snapshot,
  hasDirty:()=>snapshot().some(entry=>entry.dirty),
  isBusy:()=>saving||snapshot().some(entry=>entry.busy),
  canDiscard:()=>snapshot().filter(entry=>entry.dirty).every(entry=>!!entry.discard),
  discardAll(){for(const entry of snapshot())if(entry.dirty)entry.discard?.();},
  async saveAll():Promise<EditorSaveResult>{
   if(saving||snapshot().some(entry=>entry.busy))return {ok:false,label:'Current operation',message:'Wait for the current operation to finish, then try again.'};
   saving=true;
   try{
    // Read each handler immediately before it runs. Saving reviewed context can
    // change the following editor's version and must finish before its save.
    const ordered=[...entries.values()].sort((a,b)=>(a().priority??20)-(b().priority??20));
    for(const read of ordered){const entry=read();if(!entry.dirty)continue;
     if(entry.busy)return {ok:false,label:entry.label,message:`${entry.label} is still working. Keep this editor open and try again.`};
     if(entry.manualReview)return {ok:false,label:entry.label,message:entry.manualReview};
     try{if(!await entry.save())return {ok:false,label:entry.label,message:`Couldn’t save ${entry.label.toLowerCase()}. Review the editor’s error and try again. Your changes are still here.`};}
     catch(reason){return {ok:false,label:entry.label,message:reason instanceof Error?reason.message:`Couldn’t save ${entry.label.toLowerCase()}. Your changes are still here.`};}
    }
    return {ok:true};
   }finally{saving=false;}
  }
 };
}
