'use client';

import {useEffect,useState} from 'react';
import {Banknote,BookOpen,Brain,ChevronDown,ChevronRight,Copy,Eye,FileText,FlaskConical,FolderOpen,Globe,Home,ImagePlus,Layers3,LifeBuoy,Loader2,Mail,Megaphone,Palette,Plus,Share2,Star} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuSub,DropdownMenuSubContent,DropdownMenuSubTrigger,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import type {Product} from '@/lib/product';

type ProductSummary=Pick<Product,'id'|'title'|'slug'|'color'|'format'|'pageIconUploadId'>;
export type ProductArea='page'|'content'|'offer'|'commerce'|'voice'|'vsl'|'funnel'|'campaigns'|'automations'|'files'|'media';
const groups=[
  {label:'Product',items:[['page',Home,'Product home'],['content',BookOpen,'Content & lessons'],['offer',FlaskConical,'Offer Lab'],['commerce',Banknote,'Checkout & access']]},
  {label:'Marketing',items:[['voice',Brain,'Creator voice'],['vsl',Megaphone,'VSL script'],['funnel',Layers3,'Landing page'],['campaigns',Share2,'Campaigns'],['automations',Mail,'Email automations']]},
  {label:'Add-ons',items:[['files',FileText,'Resources'],['media',ImagePlus,'Creative assets']]},
] as const;
function initials(title:string){return title.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'FG';}
export function ProductMark({product}:{product:ProductSummary}){return <span className={`product-switcher-mark product-mark-${product.color}`} aria-hidden="true">{product.pageIconUploadId?<img src={`/api/uploads/${product.pageIconUploadId}`} alt=""/>:initials(product.title)}</span>;}
export function WorkspaceProductRail({products,selectedId,onProduct,onLibrary,onCreate}:{products:ProductSummary[];selectedId?:string;onProduct:(id:string)=>void;onLibrary:()=>void;onCreate:()=>void}){
  if(!products.length)return null;
  return <nav className="workspace-product-rail" aria-label="Your products"><button className="product-rail-library" type="button" onClick={onLibrary} title="All products" aria-label="All products"><FolderOpen size={21}/></button><span className="product-rail-divider"/><div className="product-rail-list">{products.map(product=><button type="button" key={product.id} aria-label={`Open ${product.title}`} aria-current={selectedId===product.id?'page':undefined} title={product.title} onClick={()=>onProduct(product.id)}><ProductMark product={product}/></button>)}</div><button className="product-rail-new" type="button" onClick={onCreate} title="Create a product" aria-label="Create a product"><Plus size={21}/></button></nav>;
}
export function WorkspaceProductSidebar({product,products,tab,mode,onProduct,onTab,onMode,onCustomize,onReviews}:{product:Product;products:ProductSummary[];tab:ProductArea;mode:'creator'|'member';onProduct:(id:string)=>void;onTab:(tab:ProductArea)=>void;onMode:(mode:'creator'|'member')=>void;onCustomize:()=>void;onReviews:()=>void}){
  const [toolsOpen,setToolsOpen]=useState(false),[sharing,setSharing]=useState<'share'|'copy'|null>(null),[pageLink,setPageLink]=useState(''),[linkLoading,setLinkLoading]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[lookupFailed,setLookupFailed]=useState(false),[lookupAttempt,setLookupAttempt]=useState(0);
  useEffect(()=>{setToolsOpen(false);},[product.id,tab]);
  useEffect(()=>{if(!sharing)return;let active=true;setPageLink('');setError('');setCopied(false);setLookupFailed(false);setLinkLoading(true);fetch(`/api/products/${product.id}/page`,{cache:'no-store'}).then(async response=>{const data=await response.json() as {error?:string;page:{publishedAt:number|null;publicPath:string}};if(!response.ok)throw new Error(data.error||'Could not load your page link.');if(active&&data.page.publishedAt)setPageLink(location.origin+data.page.publicPath);}).catch(e=>{if(active){setError(e.message);setLookupFailed(true);}}).finally(()=>{if(active)setLinkLoading(false);});return()=>{active=false;};},[sharing,product.id,lookupAttempt]);
  async function copy(){try{await navigator.clipboard.writeText(pageLink);setCopied(true);setError('');}catch{setError('Copy the page link from the field above. Your browser could not copy it automatically.');}}
  function select(area:ProductArea){setToolsOpen(false);onTab(area);}
  const toolList=<div className="product-tool-groups">{groups.map(group=><section key={group.label}><h2>{group.label}</h2>{group.items.map(([area,Icon,title])=><button key={area} type="button" aria-current={tab===area?'page':undefined} onClick={()=>select(area)}><Icon size={17}/><span>{title}</span>{tab===area&&<ChevronRight size={13}/>}</button>)}</section>)}</div>;
  return <aside className="workspace-product-sidebar" aria-label="Selected product tools">
    <div className="product-context-heading"><DropdownMenu><DropdownMenuTrigger asChild><button className="product-options-trigger" type="button" aria-label={`Product options for ${product.title}`}><ProductMark product={product}/><span><strong>{product.title}</strong><small>Creator workspace</small></span><ChevronDown size={16}/></button></DropdownMenuTrigger><DropdownMenuContent className="product-options-menu" align="start" sideOffset={8} collisionPadding={12}>
      <DropdownMenuLabel>{product.title}</DropdownMenuLabel><DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={onCustomize}><Palette/>Customize page</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>onMode(mode==='member'?'creator':'member')}><Eye/>{mode==='member'?'Return to creator view':'View as member'}</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>setSharing('share')}><Share2/>Share & invite</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>setSharing('copy')}><Copy/>Copy page link</DropdownMenuItem>
      <DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={onReviews}><Star/>Customer reviews</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>select('commerce')}><Banknote/>Manage checkout & access</DropdownMenuItem>
      <DropdownMenuSub><DropdownMenuSubTrigger><FolderOpen/>Switch product</DropdownMenuSubTrigger><DropdownMenuSubContent className="product-options-menu product-switch-menu" sideOffset={8} collisionPadding={12}>{products.map(item=><DropdownMenuItem key={item.id} onSelect={()=>onProduct(item.id)}><ProductMark product={item}/><span>{item.title}</span></DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
      <DropdownMenuSeparator/><DropdownMenuItem asChild><a href={`mailto:kamzewac@gmail.com?subject=${encodeURIComponent('FiveGen support: '+product.title)}`}><LifeBuoy/>Contact FiveGen support</a></DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu><button className="product-tools-mobile-trigger" type="button" onClick={()=>setToolsOpen(true)}><Layers3 size={17}/><span>Tools</span></button></div>
    <div className="product-sidebar-tools">{toolList}</div>
    <div className="product-sidebar-footer"><button type="button" onClick={()=>onMode(mode==='member'?'creator':'member')}><Eye size={16}/>{mode==='member'?'Creator view':'View as member'}</button><p>Your content. Your brand.<br/>Your next chapter.</p></div>
    <Dialog open={toolsOpen} onOpenChange={setToolsOpen}><DialogContent className="product-tools-dialog"><DialogHeader><DialogTitle>Product tools</DialogTitle><DialogDescription>{product.title}</DialogDescription></DialogHeader>{toolList}</DialogContent></Dialog>
    <Dialog open={!!sharing} onOpenChange={open=>{if(!open)setSharing(null);}}><DialogContent className="product-share-dialog"><DialogHeader><span className="product-share-icon"><Share2 size={23}/></span><DialogTitle>{sharing==='copy'?'Your product link':'Invite people to your product'}</DialogTitle><DialogDescription>Share your public product page. Viewing this page does not grant access to paid lessons or resources.</DialogDescription></DialogHeader>{linkLoading?<p role="status"><Loader2 size={17} className="spin"/>Finding your page…</p>:pageLink?<><label>Public page link<input aria-label="Public page link" value={pageLink} readOnly onFocus={e=>e.target.select()}/></label><div className="product-share-actions"><button type="button" className="button primary" onClick={()=>void copy()}><Copy size={16}/>{copied?'Link copied':'Copy link'}</button><a className="button secondary" href={pageLink} target="_blank" rel="noreferrer"><Globe size={16}/>Open page</a></div><p className="product-share-help" role="status">{copied?'Ready to paste into a message or social post.':'Send this link to your audience. Purchase and member access keep their existing checks.'}</p></>:lookupFailed?<div className="product-share-empty"><h3>Your link couldn’t load.</h3><p>Try again to check your page’s current publishing status.</p><button type="button" className="button secondary" onClick={()=>setLookupAttempt(value=>value+1)}>Try again</button></div>:<div className="product-share-empty"><Home size={26}/><h3>Your page is still private.</h3><p>Customize and publish your product page to get a link you can share.</p><button type="button" className="button primary" onClick={()=>{setSharing(null);onCustomize();}}>Set up product page<ArrowForward/></button></div>}{error&&<p className="error-banner" role="alert">{error}</p>}</DialogContent></Dialog>
  </aside>;
}
function ArrowForward(){return <ChevronRight size={16}/>;}
