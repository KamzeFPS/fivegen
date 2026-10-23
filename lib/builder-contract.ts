import {z} from 'zod';
import type {ProductStudioConfig} from './product-studio-contract';
import {sectionSchema,fileSchema,type Brief} from './product';
import type {CommerceAccount} from './commerce-v2';
import type {Product} from './product';
import type {SaleUpload} from './file-sale-contract';

export const builderTypes=['book','guide','playbook','mini-course','video-course','template-kit','challenge','consulting','coaching','community','custom'] as const;
export type BuilderType=typeof builderTypes[number];
export type BuilderSource='ai'|'upload'|'manual';
export type BuilderFamily='document'|'course'|'templates'|'challenge'|'service'|'community'|'custom';
export const builderTypeDetails:Record<BuilderType,{name:string;format:Brief['format'];family:BuilderFamily;unit:string;plural:string;description:string;prompt:string}>={
 book:{name:'Book / eBook',format:'Book',family:'document',unit:'Chapter',plural:'chapters',description:'Write a book or bring a finished manuscript.',prompt:'What should your reader understand or achieve by the last chapter?'},
 guide:{name:'Guide',format:'Guide',family:'document',unit:'Section',plural:'sections',description:'Help someone solve one specific problem.',prompt:'What problem does your guide help the reader solve?'},
 playbook:{name:'Playbook',format:'Playbook',family:'document',unit:'Process',plural:'processes',description:'Turn your repeatable process into a practical resource.',prompt:'What process should someone be able to repeat successfully?'},
 'mini-course':{name:'Mini course',format:'Mini course',family:'course',unit:'Lesson',plural:'lessons',description:'Teach one focused outcome with practical lessons.',prompt:'What skill should students practice and demonstrate?'},
 'video-course':{name:'Full / video course',format:'Video course',family:'course',unit:'Lesson',plural:'lessons',description:'Organize a curriculum with modules, lessons and recordings.',prompt:'What transformation will your curriculum help learners work toward?'},
 'template-kit':{name:'Template kit',format:'Template kit',family:'templates',unit:'Template',plural:'templates',description:'Package reusable files, examples and instructions.',prompt:'What repetitive task will these templates make easier?'},
 challenge:{name:'Challenge',format:'Challenge',family:'challenge',unit:'Day',plural:'days',description:'Build a self-paced sequence of concrete activities.',prompt:'What will participants practice and complete each day?'},
 consulting:{name:'Consulting / Mentorship',format:'Consulting / Mentorship',family:'service',unit:'Resource',plural:'resources',description:'Define your service, session and customer preparation.',prompt:'What will your client leave the session with?'},
 coaching:{name:'Coaching session',format:'Coaching session',family:'service',unit:'Resource',plural:'resources',description:'Offer a focused session with clear preparation and scope.',prompt:'What will you work on together during this session?'},
 community:{name:'Community',format:'Community',family:'community',unit:'Resource',plural:'resources',description:'Prepare your member welcome, rules and shared resources.',prompt:'Why will members return and help each other?'},
 custom:{name:'Custom product',format:'Custom product',family:'custom',unit:'Component',plural:'components',description:'Choose a supported delivery format and build around it.',prompt:'What exactly will customers receive and how will they use it?'},
};
export const builderDraftSchema=z.object({
 studio:z.custom<ProductStudioConfig>(value=>{try{return !!value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(value).length<=350000;}catch{return false;}},'Product settings exceed the supported size.').optional(),
 type:z.enum(builderTypes),source:z.enum(['ai','upload','manual']),
 title:z.string().trim().max(100),description:z.string().trim().max(12000),audience:z.string().trim().max(300),language:z.string().trim().min(1).max(50),
 fields:z.record(z.string().max(6000)).refine(fields=>Object.keys(fields).length<=30&&Object.keys(fields).every(key=>/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)),'Use supported product fields.'),
 sections:z.array(sectionSchema).max(30).refine(items=>new Set(items.map(item=>item.id).filter(Boolean)).size===items.filter(item=>item.id).length,'Use distinct section identities.'),
 files:z.array(fileSchema).max(20).refine(items=>new Set(items.map(item=>item.name.toLowerCase())).size===items.length,'Use a unique filename for each resource.'),
 uploadIds:z.array(z.string().uuid()).max(20).refine(ids=>new Set(ids).size===ids.length,'Attach each file once.'),
 coverUploadId:z.string().uuid().optional(),priceCents:z.number().int().min(0).max(999900),currency:z.enum(['usd','eur','gbp','cad','aud']),
});
export type BuilderDraft=z.infer<typeof builderDraftSchema>;
export type BuilderCheck={key:string;ready:boolean;message:string};
export type BuilderWorkspace={product:Product;draft:BuilderDraft;version:number;uploads:SaleUpload[];readiness:{publishReady:boolean;checks:BuilderCheck[]};publication:{version:number;slug:string;publishedAt:number}|null;payments:CommerceAccount;selling:boolean};
export function defaultBuilderDraft(type:BuilderType,source:BuilderSource='manual'):BuilderDraft{
 return {type,source,title:'',description:'',audience:'',language:'English',fields:{outcome:'',tone:'Clear and practical',unitCount:type==='mini-course'?'5':type==='challenge'?'7':'6',instructions:'',...(type==='template-kit'?{compatibleTools:'',usageInstructions:''}:{}),...(['consulting','coaching'].includes(type)?{serviceScope:'',durationMinutes:'45',timezone:'UTC',preparation:'',meetingUrl:'',intakePrompt:'What would you like help with?'}:{}),...(type==='community'?{welcome:'',rules:'Be constructive, respect privacy, and keep discussions relevant.',memberPromise:''}:{}),...(type==='custom'?{customDelivery:'downloads'}:{})},sections:[],files:[],uploadIds:[],priceCents:0,currency:'usd'};
}
export function builderTypeForFormat(format:string):BuilderType{
 return (Object.entries(builderTypeDetails).find(([,item])=>item.format===format)?.[0]||'custom') as BuilderType;
}
export function builderFamily(draft:BuilderDraft):BuilderFamily{
 if(draft.type!=='custom')return builderTypeDetails[draft.type].family;
 return ({downloads:'document',course:'course',service:'service',community:'community'} as Record<string,BuilderFamily>)[draft.fields.customDelivery]||'document';
}
export function builderBrief(draft:BuilderDraft){
 const info=builderTypeDetails[draft.type];
 const family=builderFamily(draft),format=draft.type==='custom'?(family==='service'?'Coaching session':family==='course'?'Mini course':family==='community'?'Community':info.format):info.format;
 return {title:draft.title,description:draft.description,audience:draft.audience,format,price:draft.priceCents/100,color:'orange' as const,language:draft.language,quality:'premium' as const,duration:Math.max(3,Math.min(30,Number(draft.fields.unitCount)||7)),instructions:`Outcome: ${draft.fields.outcome||''}\nRequested ${info.plural}: ${draft.fields.unitCount||''}\nTone: ${draft.fields.tone||''}\n${Object.entries(draft.fields).filter(([key])=>!['meetingUrl','communityUrl'].includes(key)).map(([key,value])=>`${key}: ${value}`).join('\n')}`};
}
