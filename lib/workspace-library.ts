import type {Product} from './product';
import type {BuilderType} from './builder-contract';

export type WorkspaceBuilderSummary={productId:string;type:BuilderType;unitCount:number;uploadCount:number;pagePublished:boolean;salesPagePublic?:boolean;selling?:boolean;draftChanges?:boolean;canonicalPath?:string;coverUrl?:string};
export type WorkspaceFileSummary={productId:string;pagePublished?:boolean;salesPagePublic?:boolean;selling?:boolean;canonicalPath?:string;coverUrl?:string};
export type ProductFilter='all'|'public'|'published'|'selling'|'draft'|'archived';
export type ProductSort='updated'|'title';
export type WorkspaceView='create'|'overview'|'library'|'crm'|'credits'|'connections'|'creator-library'|'admin';

export function initialWorkspaceView(signedIn:boolean,query:URLSearchParams):WorkspaceView{
 if(query.has('billing'))return 'credits';
 if(query.get('connect')==='mcp')return 'connections';
 const requested=query.get('view');
 if(['create','overview','library','crm','credits','connections','creator-library','admin'].includes(requested||''))return requested as WorkspaceView;
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
  const summary=builders.find(item=>item.productId===product.id)||files.find(item=>item.productId===product.id);
  if(product.archivedAt&&status!=='archived')return false;
  if(status==='archived')return !!product.archivedAt&&(format==='all'||product.format===format)&&(!term||`${product.title} ${product.format} ${product.description}`.toLocaleLowerCase().includes(term));
  return (status==='all'||(status==='selling'?summary?.selling===true:status==='public'?summary?.salesPagePublic===true:status==='draft'&&summary?.salesPagePublic!==undefined?!summary.salesPagePublic:published===(status==='published')))&&(format==='all'||product.format===format)&&(!term||`${product.title} ${product.format} ${product.description}`.toLocaleLowerCase().includes(term));
 }).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title)||a.id.localeCompare(b.id):b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
}

export function workspaceProductDestination(product:Product,builders:WorkspaceBuilderSummary[]=[],files:WorkspaceFileSummary[]=[]){
 if(builders.some(item=>item.productId===product.id))return `/build/${encodeURIComponent(product.id)}`;
 if(files.some(item=>item.productId===product.id))return `/sell/${encodeURIComponent(product.id)}`;
 return null;
}

/** Builder delivery publication is distinct from the canonical sales-page publication. */
export function workspaceProductCommercialState(product:Product,builders:WorkspaceBuilderSummary[]=[],files:WorkspaceFileSummary[]=[]){
 if(product.archivedAt)return {label:'Archived',detail:'Restore and review launch',tone:'archived'};
 const item=builders.find(value=>value.productId===product.id)||files.find(value=>value.productId===product.id);
 const published=workspaceProductPublished(product,builders,files);
 if(item?.salesPagePublic===true)return {label:item.selling===true?'Selling':item.selling===false?'Page live · sales paused':'Page live · check checkout',detail:item.selling===true?'Open product':item.selling===false?'Review Price & access':'Check checkout readiness',tone:item.selling===true?'selling':'public'};
 if(published)return {label:item?.salesPagePublic===false?'Delivery published · sales page private':'Delivery published',detail:'Continue sales page setup',tone:'attention'};
 return {label:'Private draft',detail:'Continue setup',tone:'draft'};
}
