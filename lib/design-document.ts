import {z} from 'zod';

export const designKinds=['invitation','colouring-book','poster','worksheet','social','blank'] as const;
export type DesignKind=typeof designKinds[number];
export const designFonts=['sans','serif','mono'] as const;
export const designColourSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/,'Use a six-digit hex colour.');
const paint=z.union([designColourSchema,z.literal('none')]);
const coordinate=z.number().finite().min(-10000).max(10000);
const dimension=z.number().finite().min(1).max(10000);
const designIdentity=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

/** Accept only bounded vector drawing commands, never SVG/XML or external references. */
export function validDesignPath(value:string){
 if(!value||value.length>6000)return false;
 const tokens=value.match(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
 if(!tokens||tokens.length>1800||value.replace(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g,'')||!/^[Mm]$/.test(tokens[0]))return false;
 let index=0,command='';
 while(index<tokens.length){
  if(/^[MLCQZmlcqz]$/.test(tokens[index])){command=tokens[index++];if(command.toUpperCase()==='Z'){command='';continue;}}
  const count=({M:2,L:2,C:6,Q:4} as Record<string,number>)[command.toUpperCase()];if(!count)return false;
  for(let n=0;n<count;n++){if(index>=tokens.length||/^[MLCQZmlcqz]$/.test(tokens[index]))return false;const number=Number(tokens[index++]);if(!Number.isFinite(number)||Math.abs(number)>10000)return false;}
 }
 return true;
}
const common={id:designIdentity,x:coordinate.default(0),y:coordinate.default(0),width:dimension,height:dimension,rotation:z.number().finite().min(-360).max(360).default(0),opacity:z.number().finite().min(0).max(1).default(1),locked:z.boolean().default(false)};
const lineStyle={fill:paint.default('none'),stroke:paint.default('#1f2937'),strokeWidth:z.number().finite().min(0).max(100).default(2)};
export const designElementSchema=z.discriminatedUnion('type',[
 z.object({...common,type:z.literal('text'),text:z.string().max(6000),fontFamily:z.enum(designFonts).default('sans'),fontSize:z.number().finite().min(6).max(600).default(32),fontWeight:z.enum(['normal','bold']).default('normal'),align:z.enum(['left','center','right']).default('left'),fill:designColourSchema.default('#1f2937')}).strict(),
 z.object({...common,...lineStyle,type:z.literal('rect'),radius:z.number().finite().min(0).max(5000).default(0)}).strict(),
 z.object({...common,...lineStyle,type:z.literal('ellipse')}).strict(),
 z.object({...common,...lineStyle,type:z.literal('path'),viewBoxWidth:dimension,viewBoxHeight:dimension,d:z.string().max(6000).refine(validDesignPath,'Use a valid bounded M, L, C, Q or Z vector path.')}).strict(),
 z.object({...common,type:z.literal('image'),uploadId:z.string().uuid()}).strict(),
]);
export type DesignElement=z.infer<typeof designElementSchema>;
export const designPageSchema=z.object({id:designIdentity,name:z.string().trim().min(1).max(100),width:z.number().int().min(240).max(4096),height:z.number().int().min(240).max(4096),background:designColourSchema.default('#ffffff'),elements:z.array(designElementSchema).max(120)}).strict();
export type DesignPage=z.infer<typeof designPageSchema>;
export const designDocumentSchema=z.object({schemaVersion:z.literal(1),title:z.string().trim().min(1).max(150),kind:z.enum(designKinds),pages:z.array(designPageSchema).min(1).max(20)}).strict().superRefine((value,ctx)=>{
 const ids=[...value.pages.map(page=>page.id),...value.pages.flatMap(page=>page.elements.map(element=>element.id))];
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Give every page and element its own identity.'});
 if(new TextEncoder().encode(JSON.stringify(value)).length>240000)ctx.addIssue({code:'custom',message:'This design is too large. Simplify paths or split it into another product.'});
});
export type DesignDocument=z.infer<typeof designDocumentSchema>;
export const designKindLabels:Record<DesignKind,string>={invitation:'Invitation','colouring-book':'Colouring book',poster:'Poster',worksheet:'Worksheet',social:'Social graphic',blank:'Blank design'};
export function designImageIds(document:DesignDocument){return [...new Set(document.pages.flatMap(page=>page.elements.flatMap(element=>element.type==='image'?[element.uploadId]:[])))];}
export function blankDesign(kind:DesignKind='blank',width=794,height=1123):DesignDocument{return designDocumentSchema.parse({schemaVersion:1,title:kind==='blank'?'Untitled design':designKindLabels[kind],kind,pages:[{id:crypto.randomUUID(),name:'Page 1',width,height,background:'#ffffff',elements:[]}]});}
export function designElement(type:DesignElement['type'],overrides:Record<string,unknown>={}):DesignElement{
 return designElementSchema.parse({id:crypto.randomUUID(),type,x:80,y:80,width:type==='text'?400:180,height:type==='text'?100:180,...(type==='text'?{text:'Your text',fill:'#202020'}:type==='path'?{viewBoxWidth:180,viewBoxHeight:180,d:'M 0 90 Q 90 0 180 90 Q 90 180 0 90 Z'}:type==='image'?{}:{fill:'#ff804a',stroke:'none'}),...overrides});
}
