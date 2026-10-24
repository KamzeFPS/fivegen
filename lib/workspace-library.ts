import type {Product} from './product';
import type {BuilderType} from './builder-contract';

export type WorkspaceBuilderSummary={productId:string;type:BuilderType;unitCount:number;uploadCount:number;pagePublished:boolean;coverUrl?:string};
export type WorkspaceFileSummary={productId:string;pagePublished?:boolean;coverUrl?:string};
export type ProductFilter='all'|'published'|'draft';
export type ProductSort='updated'|'title';
export type WorkspaceView='create'|'overview'|'library'|'crm'|'credits'|'connections'|'admin';

export function initialWorkspaceView(signedIn:boolean,query:URLSearchParams):WorkspaceView{
 if(query.has('billing'))return 'credits';
 if(query.get('connect')==='mcp')return 'connections';
 const requested=query.get('view');
 if(['create','overview','library','crm','credits','connections','admin'].includes(requested||''))return requested as WorkspaceView;
 if(['marketing','vsl','funnel'].includes(requested||''))return 'library';
 // A saved conversation or product is an explicit task, even if it is no
 // longer found. Do not replace its recovery screen with a dashboard.
 if(query.has('conversation')||query.has('project'))return 'create';
 return signedIn?'overview':'create';
}

/** A published page and a product currently accepting payments are separate states. */
export function workspaceProductPublished(product:Product,builders:WorkspaceBuilderSummary[]=[],files:WorkspaceFileSummary[]=[]){
 const builder=builders.find(item=>item.productId===product.id);
 if(builder)return builder.pagePublished;
 const file=files.find(item=>item.productId===product.id);
 return file?.pagePublished??product.status==='published';
}

export function selectWorkspaceProducts(products:Product[],{query='',status='all',format='all',sort='updated',builders=[],files=[]}:{query?:string;status?:ProductFilter;format?:string;sort?:ProductSort;builders?:WorkspaceBuilderSummary[];files?:WorkspaceFileSummary[]}={}){
 const term=query.trim().toLocaleLowerCase();
 return products.filter(product=>{
  const published=workspaceProductPublished(product,builders,files);
  return (status==='all'||published===(status==='published'))&&(format==='all'||product.format===format)&&(!term||`${product.title} ${product.format} ${product.description}`.toLocaleLowerCase().includes(term));
 }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title)||a.id.localeCompare(b.id):b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
}

export function workspaceProductDestination(product:Product,builders:WorkspaceBuilderSummary[]=[],files:WorkspaceFileSummary[]=[]){
 if(builders.some(item=>item.productId===product.id))return `/build/${encodeURIComponent(product.id)}`;
 if(files.some(item=>item.productId===product.id))return `/sell/${encodeURIComponent(product.id)}`;
 return null;
}
