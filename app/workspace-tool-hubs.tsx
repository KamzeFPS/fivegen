'use client';

import {useState} from 'react';
import {ArrowRight,BarChart3,BookOpen,FileText,Layers3,Mail,Megaphone,Palette,Search,Sparkles,Video} from 'lucide-react';
import type {Product} from '@/lib/product';
import type {WorkspaceBuilderSummary} from '@/lib/workspace-library';
import type {MarketingTab} from './marketing-workspace';
import './workspace-tool-hubs.css';

type HubProduct=Pick<Product,'id'|'title'|'format'|'description'|'archivedAt'|'updatedAt'>;
type BaseProps={products:HubProduct[];signedIn:boolean;onVisit:(path:string)=>void;onHome:()=>void};
export const workspaceMarketingTools:{id:MarketingTab;title:string;description:string;icon:typeof Megaphone}[]=[
 {id:'dashboard',title:'Growth plan',description:'Set a goal and choose your next launch steps.',icon:Sparkles},
 {id:'funnel-builder',title:'Funnel Builder',description:'Map the journey from first interest to the next action.',icon:Layers3},
 {id:'campaigns',title:'Campaigns',description:'Prepare posts, scripts and campaign drafts.',icon:Megaphone},
 {id:'automations',title:'Emails',description:'Review follow-up for your leads and customers.',icon:Mail},
 {id:'funnel',title:'Lead capture',description:'Build a page for interest, requests or applications.',icon:FileText},
 {id:'results',title:'Results',description:'Review recorded activity for this product.',icon:BarChart3},
 {id:'vsl',title:'Sales video',description:'Prepare your script and creator recording.',icon:Video},
 {id:'offer',title:'Test my offer',description:'Learn from audience responses to your offer.',icon:BookOpen},
 {id:'voice',title:'Creator references',description:'Choose reviewed private sources for this product.',icon:FileText},
];
export function workspaceHubProducts(products:HubProduct[],query=''){
 const term=query.trim().toLocaleLowerCase();
 return products.filter(product=>!product.archivedAt&&(!term||`${product.title} ${product.format} ${product.description}`.toLocaleLowerCase().includes(term))).sort((a,b)=>b.updatedAt-a.updatedAt||a.title.localeCompare(b.title));
}
function ProductMark(){return <span className="wth-product-mark"><FileText size={19} aria-hidden="true"/></span>;}
function SignIn({kind,onVisit}:{kind:'marketing'|'design';onVisit:BaseProps['onVisit']}){return <div className="wth-empty"><h2>Your workspace is waiting.</h2><p>Sign in to choose one of your products and continue {kind==='marketing'?'its marketing':'your designs'}.</p><button type="button" className="button primary" onClick={()=>onVisit('/signin-with-chatgpt?return_to='+encodeURIComponent('/?view='+kind))}>Sign in<ArrowRight size={15}/></button></div>;}

export function WorkspaceMarketingHub({products,signedIn,onOpen,onVisit,onHome}:{onOpen:(productId:string,tool:MarketingTab)=>void}&BaseProps){
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState('');
 const available=workspaceHubProducts(products),visible=workspaceHubProducts(products,query),selected=available.find(product=>product.id===selectedId);
 return <section className="workspace-tool-hub" aria-labelledby="marketing-hub-title">
  <header className="wth-heading"><div><span className="wth-eyebrow"><Megaphone size={15} aria-hidden="true"/>YOUR WORKSPACE</span><h1 id="marketing-hub-title">Marketing</h1><p>A clear next step for the product you choose.</p></div></header>
  {!signedIn?<SignIn kind="marketing" onVisit={onVisit}/>:!available.length?<div className="wth-empty"><Megaphone size={29} aria-hidden="true"/><h2>Start with a product.</h2><p>Your launch plans, campaigns and follow-up stay connected to the product they support.</p><button type="button" className="button primary" onClick={onHome}>Bring your idea to Home<ArrowRight size={15}/></button></div>:<div className="wth-marketing-layout">
   <aside className="wth-product-picker" aria-labelledby="marketing-product-heading"><h2 id="marketing-product-heading">Choose a product</h2><label className="wth-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search marketing products" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search your products"/></label><div className="wth-product-options">{visible.map(product=><button type="button" key={product.id} className={`wth-product-option${selected?.id===product.id?' is-selected':''}`} aria-pressed={selected?.id===product.id} onClick={()=>setSelectedId(product.id)}><ProductMark/><span><strong>{product.title}</strong><small>{product.format}</small></span><ArrowRight size={14} aria-hidden="true"/></button>)}{!visible.length&&<p className="wth-no-results" role="status">No products match “{query}”.</p>}</div></aside>
   <div className="wth-tools"><div className="wth-selected-product"><span>{selected?'MARKETING FOR':'YOUR MARKETING TOOLS'}</span><h2>{selected?.title||'Which product are you working on?'}</h2><p>{selected?'Choose where to continue. Your saved drafts open in their existing workspace.':'Select a product to open its plans, campaigns and results.'}</p></div>{selected?<div className="wth-tool-grid">{workspaceMarketingTools.map(({id,title,description,icon:Icon})=><button type="button" className="wth-tool" key={id} disabled={!selected} onClick={()=>{if(selected)onOpen(selected.id,id);}}><span className="wth-tool-icon"><Icon size={19} aria-hidden="true"/></span><strong>{title}</strong><p>{description}</p><ArrowRight className="wth-tool-arrow" size={15} aria-hidden="true"/></button>)}</div>:<div className="wth-pick-hint"><Megaphone size={28} aria-hidden="true"/><p>Your marketing tools will appear here once you choose a product.</p></div>}</div>
  </div>}
 </section>;
}

export function WorkspaceDesignHub({products,builders=[],signedIn,onVisit,onHome}:{builders?:WorkspaceBuilderSummary[]}&BaseProps){
 const [query,setQuery]=useState('');
 const builderIds=new Set(builders.map(builder=>builder.productId)),available=workspaceHubProducts(products).filter(product=>builderIds.has(product.id)),visible=workspaceHubProducts(available,query);
 return <section className="workspace-tool-hub" aria-labelledby="design-hub-title">
  <header className="wth-heading"><div><span className="wth-eyebrow"><Palette size={15} aria-hidden="true"/>YOUR WORKSPACE</span><h1 id="design-hub-title">Design</h1><p>Editable pages for your next idea.</p></div>{signedIn&&<button type="button" className="button primary" onClick={()=>onVisit('/build/new?type=template-kit&design=1')}>New design<ArrowRight size={15}/></button>}</header>
  {!signedIn?<SignIn kind="design" onVisit={onVisit}/>:<><section className="wth-design-intro"><Palette className="wth-design-icon" size={34} aria-hidden="true"/><div><h2>Make something your own.</h2><p>Start an invitation, colouring book, poster or worksheet. Add text, shapes and images, then export your finished pages.</p><button type="button" className="wth-text-action" onClick={()=>onVisit('/build/new?type=template-kit&design=1')}>Start in Design studio<ArrowRight size={15}/></button></div></section>
   <div className="wth-section-heading"><div><h2>Products with a design workspace</h2><p>Open a product’s canvas to continue its pages or start a design.</p></div>{!!available.length&&<label className="wth-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search design products" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a product"/></label>}</div>
   {visible.length?<div className="wth-design-products">{visible.map(product=><button type="button" key={product.id} className="wth-design-product" onClick={()=>onVisit(`/build/${encodeURIComponent(product.id)}?area=design`)}><ProductMark/><span><strong>{product.title}</strong><small>{product.format} · Design workspace</small></span><span className="wth-open-label">Open canvas<ArrowRight size={15} aria-hidden="true"/></span></button>)}</div>:<div className="wth-empty wth-empty-compact"><h3>{available.length?'No matching products.':'Your next design starts here.'}</h3><p>{available.length?'Try another product name.':'Create a new design product, or bring a product idea to Home.'}</p>{!available.length&&<button type="button" className="wth-text-action" onClick={onHome}>Go to Home<ArrowRight size={15}/></button>}</div>}
  </>}
 </section>;
}
