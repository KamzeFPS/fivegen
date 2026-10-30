import {z} from 'zod';
import type {CatalogDomain} from './creator-catalog';

export const reservedWorkspaceNames=new Set(['www','app','api','admin','administrator','auth','assets','billing','blog','cdn','checkout','connect','customer','dashboard','demo','dev','docs','downloads','email','help','home','legal','login','mail','mcp','media','oauth','privacy','root','security','settings','signin','signup','static','status','support','system','terms','test','uploads','web','webhooks','workspace','fivegen']);
export const reservedProductPaths=new Set([...reservedWorkspaceNames,'access','account','b','build','callback','creator','f','favicon','fonts','g','healthz','invite','learn','o','p','partners','pricing','product','r','reset-password','robots','signout','unsubscribe','verify-email','welcome','_next']);
const label=z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/,'Use 3–50 letters, numbers or hyphens, starting with a letter.');
export const workspaceSubdomainSchema=label.refine(value=>!reservedWorkspaceNames.has(value),'This address is reserved. Choose another name.');
export const workspaceProductPathSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/,'Use 1–80 lowercase letters, numbers or hyphens without a slash.').refine(value=>!reservedProductPaths.has(value),'This path is reserved. Choose another name.');
export const workspaceDomainsSaveSchema=z.object({expectedVersion:z.number().int().nonnegative(),subdomain:workspaceSubdomainSchema.nullable(),productPaths:z.array(z.object({productId:z.string().uuid(),path:workspaceProductPathSchema}).strict()).max(100)}).strict().superRefine((value,context)=>{if(new Set(value.productPaths.map(item=>item.productId)).size!==value.productPaths.length)context.addIssue({code:'custom',path:['productPaths'],message:'Set one path per product.'});if(new Set(value.productPaths.map(item=>item.path)).size!==value.productPaths.length)context.addIssue({code:'custom',path:['productPaths'],message:'Each product needs a different path.'});});
export type WorkspaceDomainsState={
 appOrigin:string;baseDomain:string;version:number;
 subdomain:null|{label:string;hostname:string;url:string;active:boolean;message:string};
 customDomain:CatalogDomain|null;
 catalog:null|{path:string;url:string;published:boolean};
 products:{id:string;title:string;format:string;editPath:string;path:string|null;published:boolean;publicPath:string|null;url:string|null;customUrl:string|null}[];
};
