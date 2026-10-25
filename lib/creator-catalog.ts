import {z} from 'zod';
export const creatorCatalogDraftSchema=z.object({
 slug:z.union([z.literal(''),z.string().trim().regex(/^[a-z][a-z0-9-]{2,49}$/,'Use 3–50 lowercase letters, numbers or hyphens, starting with a letter.')]),
 title:z.string().trim().max(100),tagline:z.string().trim().max(300),story:z.string().trim().max(6000),creatorName:z.string().trim().max(100),
 publicEmail:z.union([z.literal(''),z.string().trim().email().max(254)]),accentHex:z.string().regex(/^#[0-9a-f]{6}$/i),theme:z.enum(['light','dark']),
 productIds:z.array(z.string().uuid()).max(30).refine(ids=>new Set(ids).size===ids.length,'Include each product once.'),iconProductId:z.string().uuid().nullable(),
}).strict();
export type CreatorCatalogDraft=z.infer<typeof creatorCatalogDraftSchema>;
export const defaultCreatorCatalogDraft=():CreatorCatalogDraft=>({slug:'',title:'',tagline:'',story:'',creatorName:'',publicEmail:'',accentHex:'#FF804A',theme:'dark',productIds:[],iconProductId:null});
export type CatalogProduct={id:string;title:string;description:string;format:string;href:string;iconUrl:string|null;bannerUrl:string|null};
export type CatalogDomain={hostname:string;updatedAt:number;records:{type:'TXT'|'CNAME';name:string;value:string}[];ownershipVerifiedAt:number|null;dnsVerifiedAt:number|null;checkedAt:number|null;message:string;platformStatus:'pending'|'connected';tlsStatus:'pending'|'active';active:boolean};
export type CreatorCatalogState={appOrigin?:string;draft:CreatorCatalogDraft;version:number;updatedAt:number;publishedAt:number|null;publishedVersion:number|null;publicPath:string|null;products:CatalogProduct[];domain:CatalogDomain|null};
export function catalogPublishProblem(draft:CreatorCatalogDraft){if(!draft.slug)return 'Choose your catalog link.';if(draft.title.length<3)return 'Add a title of at least 3 characters.';if(!draft.productIds.length)return 'Choose at least one published product.';if(draft.iconProductId&&!draft.productIds.includes(draft.iconProductId))return 'Choose a catalog icon from an included public product.';return null;}
