'use client';

import {useEffect,useState} from 'react';
import {Banknote,BookOpen,ChevronDown,ChevronRight,Copy,Eye,FolderOpen,Globe,Home,Layers3,LifeBuoy,Loader2,Palette,PanelLeftClose,PanelLeftOpen,Pin,Plus,Rocket,Search,Settings2,Share2,Star,Users} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {Product} from '@/lib/product';
import {searchProductNavigation,visibleProductPins} from '@/lib/product-navigation';

type ProductSummary=Pick<Product,'id'|'title'|'slug'|'color'|'format'|'pageIconUploadId'>&{archivedAt?:number|null};
export type ProductArea='page'|'content'|'dashboard'|'offer'|'commerce'|'voice'|'vsl'|'funnel'|'campaigns'|'automations'|'files'|'media';
export type ProductExtraTool={id:string;label:string;onSelect:()=>void};
export type ProductDestination='overview'|'content'|'sales-page'|'commerce'|'marketing'|'customers'|'settings';
export const productDestinations=[
  {id:'overview' as const,label:'Overview',icon:Home},
  {id:'content' as const,label:'Content',icon:BookOpen},
  {id:'sales-page' as const,label:'Sales page',icon:Globe},
  {id:'commerce' as const,label:'Price & access',icon:Banknote},
  {id:'marketing' as const,label:'Marketing',icon:Rocket},
  {id:'customers' as const,label:'Customers',icon:Users},
  {id:'settings' as const,label:'Settings',icon:Settings2},
];
export function productDestinationPath(productId:string,destination:ProductDestination){
 const area={overview:'overview',content:'content','sales-page':'page',commerce:'commerce',marketing:'dashboard',customers:'people',settings:'details'}[destination];
 return destination==='marketing'?`/?project=${encodeURIComponent(productId)}&area=${area}`:`/build/${encodeURIComponent(productId)}?area=${area}`;
}
function initials(title:string){return title.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'FG';}
export function ProductMark({product}:{product:ProductSummary}){return <span className={`product-switcher-mark product-mark-${product.color}`} aria-hidden="true">{product.pageIconUploadId?<img src={`/api/uploads/${product.pageIconUploadId}`} alt=""/>:initials(product.title)}</span>;}
function useProductPins(products:ProductSummary[]){
 const [pins,setPins]=useState<string[]>([]);
 useEffect(()=>{function read(){try{setPins(visibleProductPins(JSON.parse(localStorage.getItem('fivegen.product-pins')||'[]'),products.map(product=>product.id)));}catch{setPins([]);}}queueMicrotask(read);window.addEventListener('fivegen-pins',read);return()=>window.removeEventListener('fivegen-pins',read);},[products]);
 function toggle(id:string){const next=pins.includes(id)?pins.filter(value=>value!==id):[id,...pins].slice(0,20);setPins(next);try{localStorage.setItem('fivegen.product-pins',JSON.stringify(next));window.dispatchEvent(new Event('fivegen-pins'));}catch{/* Browsing and switching still work without persisted preferences. */}}
 return {pins,toggle};
}
function ProductSwitchDialog({open,onOpenChange,products,selectedId,onProduct}:{open:boolean;onOpenChange:(open:boolean)=>void;products:ProductSummary[];selectedId?:string;onProduct:(id:string)=>void}){
 const [query,setQuery]=useState(''),{pins,toggle}=useProductPins(products),visible=searchProductNavigation(products,query,pins);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="product-switch-dialog"><DialogHeader><DialogTitle>Switch product</DialogTitle><DialogDescription>Find a product by name or type. Pin the ones you work on most.</DialogDescription></DialogHeader><label className="product-switch-search"><Search size={18}/><input type="search" aria-label="Find a product" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search your products…"/></label><div className="product-switch-results">{visible.map(product=><div key={product.id}><button type="button" aria-current={selectedId===product.id?'page':undefined} onClick={()=>{onOpenChange(false);onProduct(product.id);}}><ProductMark product={product}/><span><strong>{product.title}</strong><small>{product.format}</small></span></button><button type="button" aria-label={`${pins.includes(product.id)?'Unpin':'Pin'} ${product.title}`} aria-pressed={pins.includes(product.id)} onClick={()=>toggle(product.id)}><Pin size={17}/></button></div>)}{!visible.length&&<p role="status">No products match. Try a different name or type.</p>}</div></DialogContent></Dialog>;
}
export function WorkspaceProductRail({products,selectedId,onProduct,onLibrary,onCreate}:{products:ProductSummary[];selectedId?:string;onProduct:(id:string)=>void;onLibrary:()=>void;onCreate:()=>void}){
 const [collapsed,setCollapsed]=useState(false),[switching,setSwitching]=useState(false),{pins}=useProductPins(products);
 useEffect(()=>{queueMicrotask(()=>{try{setCollapsed(localStorage.getItem('fivegen.product-rail-collapsed')==='true');}catch{}});},[]);
 function collapse(){setCollapsed(!collapsed);try{localStorage.setItem('fivegen.product-rail-collapsed',String(!collapsed));}catch{}}
 if(!products.length)return null;
 const visible=searchProductNavigation(products,'',pins);
 return <><nav className={`workspace-product-rail ${collapsed?'is-collapsed':''}`} aria-label="Your products"><button className="product-rail-library" type="button" onClick={onLibrary} title="All products" aria-label="All products"><FolderOpen size={21}/></button><button className="product-rail-library" type="button" onClick={()=>setSwitching(true)} title="Find and pin products" aria-label="Find and pin products"><Search size={19}/></button><span className="product-rail-divider"/>{!collapsed&&<div className="product-rail-list">{visible.map(product=><button type="button" key={product.id} aria-label={`Open ${product.title}${pins.includes(product.id)?' · pinned':''}`} aria-current={selectedId===product.id?'page':undefined} title={product.title} onClick={()=>onProduct(product.id)}><ProductMark product={product}/>{pins.includes(product.id)&&<Pin className="product-pin-indicator" size={10}/>}</button>)}</div>}<button className="product-rail-new" type="button" onClick={onCreate} title="Create a product" aria-label="Create a product"><Plus size={21}/></button><button className="product-rail-collapse" type="button" aria-expanded={!collapsed} aria-label={collapsed?'Expand product rail':'Collapse product rail'} title={collapsed?'Expand product rail':'Collapse product rail'} onClick={collapse}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button></nav><ProductSwitchDialog open={switching} onOpenChange={setSwitching} products={products} selectedId={selectedId} onProduct={onProduct}/></>;
}
export function WorkspaceProductSidebar({product,products,tab,mode,onProduct,onTab,onMode,onCustomize,onReviews,extraTools=[],activeExtra,activeDestination,onDestination}:{product:Product;products:ProductSummary[];tab:ProductArea;mode:'creator'|'member';onProduct:(id:string)=>void;onTab:(tab:ProductArea)=>void;onMode:(mode:'creator'|'member')=>void;onCustomize:()=>void;onReviews:()=>void;extraTools?:ProductExtraTool[];activeExtra?:string;activeDestination?:ProductDestination;onDestination?:(destination:ProductDestination)=>void}){
  const [switching,setSwitching]=useState(false),[toolsOpen,setToolsOpen]=useState(false),[sharing,setSharing]=useState<'share'|'copy'|null>(null),[pageLink,setPageLink]=useState(''),[linkLoading,setLinkLoading]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[lookupFailed,setLookupFailed]=useState(false),[lookupAttempt,setLookupAttempt]=useState(0);
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)setToolsOpen(false);});return()=>{active=false;};},[product.id,tab,activeExtra,activeDestination]);
  useEffect(()=>{if(!sharing)return;let active=true;queueMicrotask(()=>{if(!active)return;setPageLink('');setError('');setCopied(false);setLookupFailed(false);setLinkLoading(true);});fetch(`/api/products/${product.id}/page`,{cache:'no-store'}).then(async response=>{const data=await response.json() as {error?:string;page:{publishedAt:number|null;publicPath:string}};if(!response.ok)throw new Error(data.error||'Could not load your page link.');if(active&&data.page.publishedAt)setPageLink(location.origin+data.page.publicPath);}).catch(e=>{if(active){setError(e.message);setLookupFailed(true);}}).finally(()=>{if(active)setLinkLoading(false);});return()=>{active=false;};},[sharing,product.id,lookupAttempt]);
  async function copy(){try{await navigator.clipboard.writeText(pageLink);setCopied(true);setError('');}catch{setError('Copy the page link from the field above. Your browser could not copy it automatically.');}}
  function select(area:ProductArea){setToolsOpen(false);onTab(area);}
  const currentDestination:ProductDestination=activeDestination||(activeExtra==='launch'?'overview':activeExtra==='people'?'customers':activeExtra==='details'?'settings':activeExtra==='appearance'||tab==='page'?'sales-page':['dashboard','offer','voice','vsl','funnel','campaigns','automations'].includes(tab)?'marketing':tab==='commerce'?'commerce':'content');
  function go(destination:ProductDestination){
    setToolsOpen(false);
    if(onDestination){onDestination(destination);return;}
    const extraId={overview:'launch',customers:'people',settings:'details'}[destination as 'overview'|'customers'|'settings'];
    const extra=extraTools.find(tool=>tool.id===extraId);
    if(extra){extra.onSelect();return;}
    if(destination==='sales-page'){onCustomize();return;}
    if(destination==='content'){onTab('content');return;}
    if(destination==='commerce'){onTab('commerce');return;}
    if(destination==='marketing'){onTab('dashboard');return;}
    // Rich-builder consumers should supply onDestination to retain unsaved-work guards.
    location.assign(productDestinationPath(product.id,destination));
  }
  const toolList=<nav className="product-tool-groups" aria-label="Product navigation"><section>{productDestinations.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={currentDestination===id?'page':undefined} onClick={()=>go(id)}><Icon size={18}/><span>{label}</span>{currentDestination===id&&<ChevronRight size={13}/>}</button>)}</section></nav>;
  return <aside className="workspace-product-sidebar" aria-label="Selected product tools">
    <div className="product-context-heading"><DropdownMenu><DropdownMenuTrigger asChild><button className="product-options-trigger" type="button" aria-label={`Product options for ${product.title}`}><ProductMark product={product}/><span><strong>{product.title}</strong><small>Creator workspace</small></span><ChevronDown size={16}/></button></DropdownMenuTrigger><DropdownMenuContent className="product-options-menu" align="start" sideOffset={8} collisionPadding={12}>
      <DropdownMenuLabel>{product.title}</DropdownMenuLabel><DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={onCustomize}><Palette/>Edit sales page</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>onMode(mode==='member'?'creator':'member')}><Eye/>{mode==='member'?'Return to creator view':'View as member'}</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>setSharing('share')}><Share2/>Share & invite</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>setSharing('copy')}><Copy/>Copy page link</DropdownMenuItem>
      <DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={onReviews}><Star/>Customer reviews</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>select('commerce')}><Banknote/>Price & access</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>setSwitching(true)}><Search/>Find & switch product</DropdownMenuItem>
      <DropdownMenuSeparator/><DropdownMenuItem asChild><a href={`mailto:kamzewac@gmail.com?subject=${encodeURIComponent('FiveGen support: '+product.title)}`}><LifeBuoy/>Contact FiveGen support</a></DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu><button className="product-tools-mobile-trigger" type="button" onClick={()=>setToolsOpen(true)}><Layers3 size={17}/><span>{productDestinations.find(item=>item.id===currentDestination)?.label||'Product'}</span></button></div>
    <div className="product-sidebar-tools">{toolList}</div>
    <div className="product-sidebar-footer"><button type="button" onClick={()=>onMode(mode==='member'?'creator':'member')}><Eye size={16}/>{mode==='member'?'Creator view':'View as member'}</button><p>Your content. Your brand.<br/>Your next chapter.</p></div>
    <ProductSwitchDialog open={switching} onOpenChange={setSwitching} products={products} selectedId={product.id} onProduct={onProduct}/>
    <Dialog open={toolsOpen} onOpenChange={setToolsOpen}><DialogContent className="product-tools-dialog"><DialogHeader><DialogTitle>Product navigation</DialogTitle><DialogDescription>{product.title}</DialogDescription></DialogHeader>{toolList}</DialogContent></Dialog>
    <Dialog open={!!sharing} onOpenChange={open=>{if(!open)setSharing(null);}}><DialogContent className="product-share-dialog"><DialogHeader><span className="product-share-icon"><Share2 size={23}/></span><DialogTitle>{sharing==='copy'?'Your product link':'Invite people to your product'}</DialogTitle><DialogDescription>Share your public product page. This is the canonical sales page address. Viewing it does not grant access to paid lessons or resources.</DialogDescription></DialogHeader>{linkLoading?<p role="status"><Loader2 size={17} className="spin"/>Finding your page…</p>:pageLink?<><label>Public page link<input aria-label="Public page link" value={pageLink} readOnly onFocus={e=>e.target.select()}/></label><div className="product-share-actions"><button type="button" className="button primary" onClick={()=>void copy()}><Copy size={16}/>{copied?'Link copied':'Copy link'}</button><a className="button secondary" href={pageLink} target="_blank" rel="noreferrer"><Globe size={16}/>Open page</a></div><p className="product-share-help" role="status">{copied?'Ready to paste into a message or social post.':'Send this link to your audience. Purchase and member access keep their existing checks.'}</p></>:lookupFailed?<div className="product-share-empty"><h3>Your link couldn’t load.</h3><p>Try again to check your page’s current publishing status.</p><button type="button" className="button secondary" onClick={()=>setLookupAttempt(value=>value+1)}>Try again</button></div>:<div className="product-share-empty"><Home size={26}/><h3>Your sales page is still private.</h3><p>Publish your sales page to get the same public address shown across FiveGen. A published delivery page is a separate state.</p><button type="button" className="button primary" onClick={()=>{setSharing(null);onCustomize();}}>Open Sales page<ArrowForward/></button></div>}{error&&<p className="error-banner" role="alert">{error}</p>}</DialogContent></Dialog>
  </aside>;
}
function ArrowForward(){return <ChevronRight size={16}/>;}
