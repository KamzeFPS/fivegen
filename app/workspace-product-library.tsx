'use client';

import {useState} from 'react';
import {ArrowRight,BookOpen,CalendarDays,FileText,FolderOpen,GraduationCap,LayoutGrid,Layers3,List,Search,Upload,Users,X} from 'lucide-react';
import type {Product} from '@/lib/product';
import {builderTypeDetails} from '@/lib/builder-contract';
import {selectWorkspaceProducts,workspaceProductPublished,type ProductFilter,type ProductSort,type WorkspaceBuilderSummary,type WorkspaceFileSummary} from '@/lib/workspace-library';

function formatIcon(format:string){
 if(/course/i.test(format))return GraduationCap;
 if(/coaching|consulting/i.test(format))return CalendarDays;
 if(format==='Community')return Users;
 if(format==='Template kit')return Layers3;
 return /book|guide/i.test(format)?BookOpen:FileText;
}

function ProductArtwork({product,url}:{product:Product;url?:string}){
 const [failed,setFailed]=useState(false),Icon=formatIcon(product.format);
 if(url&&!failed)return <span className="library-artwork library-artwork-image" aria-hidden="true"><img src={url} alt="" loading="lazy" onError={()=>setFailed(true)}/></span>;
 return <span className={`library-artwork library-artwork-${product.color}`} aria-hidden="true"><Icon size={25} strokeWidth={1.5}/><span>{product.format}</span></span>;
}

export function WorkspaceProductLibrary({products,builders=[],files=[],onOpen,onCreateFrom}:{products:Product[];builders?:WorkspaceBuilderSummary[];files?:WorkspaceFileSummary[];onOpen:(product:Product)=>void;onCreateFrom:(source:'upload'|'manual')=>void}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState<ProductFilter>('all'),[format,setFormat]=useState('all'),[sort,setSort]=useState<ProductSort>('updated'),[layout,setLayout]=useState<'grid'|'list'>('grid');
 const published=products.filter(product=>workspaceProductPublished(product,builders,files)).length;
 const counts={all:products.length,published,draft:products.length-published};
 const visible=selectWorkspaceProducts(products,{query,status,format,sort,builders,files});
 const formats=[...new Set(products.map(product=>product.format))].sort();
 const filtered=!!query.trim()||status!=='all'||format!=='all';
 function clearFilters(){setQuery('');setStatus('all');setFormat('all');}
 return <section className="gen-library gen-enter workspace-library" aria-labelledby="library-title">
  <header className="library-heading"><div><h1 id="library-title">Products <span>{products.length}</span></h1><p>Everything you’re creating, ready to pick up where you left off.</p></div></header>
  <div className="library-start-options"><span>Have something ready?</span><button type="button" onClick={()=>onCreateFrom('upload')}><Upload size={16}/>Upload existing content<ArrowRight size={14}/></button><button type="button" onClick={()=>onCreateFrom('manual')}><FileText size={16}/>Start manually<ArrowRight size={14}/></button></div>
  <div className="library-toolbar"><div className="library-filters" role="group" aria-label="Filter by publication status">{(['all','published','draft'] as const).map(key=><button type="button" key={key} aria-pressed={status===key} onClick={()=>setStatus(key)}>{key==='all'?'All products':key==='published'?'Published':'Drafts'}<span>{counts[key]}</span></button>)}</div><div className="library-layout" role="group" aria-label="Product layout"><button type="button" aria-label="Grid view" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><LayoutGrid size={17}/></button><button type="button" aria-label="List view" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><List size={18}/></button></div></div>
  <div className="library-search-row"><label className="library-search"><Search size={18}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search your products…" aria-label="Search products"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label><label className="library-select"><span>Type</span><select aria-label="Product type" value={format} onChange={event=>setFormat(event.target.value)}><option value="all">All types</option>{formats.map(value=><option key={value}>{value}</option>)}</select></label><label className="library-select library-sort"><span>Sort</span><select aria-label="Sort products" value={sort} onChange={event=>setSort(event.target.value as ProductSort)}><option value="updated">Last edited</option><option value="title">Name A–Z</option></select></label></div>
  <p className="library-result-count" role="status">{filtered?`${visible.length} of ${products.length} products`:`${products.length} product${products.length===1?'':'s'}`}{filtered&&<button type="button" onClick={clearFilters}>Clear filters</button>}</p>
  <div className={`library-products library-products-${layout}`}>{visible.map(product=>{
   const builder=builders.find(item=>item.productId===product.id),file=files.find(item=>item.productId===product.id),isPublished=workspaceProductPublished(product,builders,files),info=builder&&builderTypeDetails[builder.type];
   const details=builder?`${builder.unitCount} ${info?.plural||'sections'} · ${builder.uploadCount} file${builder.uploadCount===1?'':'s'}`:file?'Original files & private delivery':`${product.content.sections.length} sections · ${product.content.sections.filter(section=>section.videoId).length} videos`;
   return <button type="button" className="library-product" key={product.id} onClick={()=>onOpen(product)} aria-label={`Open ${product.title}`}><ProductArtwork product={product} url={builder?.coverUrl||file?.coverUrl}/><span className="library-product-details"><span className="library-product-meta"><span>{product.format}</span><span className={`library-status ${isPublished?'is-published':''}`}><i/>{isPublished?'Published':'Draft'}</span></span><strong className="library-product-title">{product.title}</strong><span className="library-product-summary">{details}</span><span className="library-product-open">Open builder <ArrowRight size={16}/></span></span></button>;
  })}</div>
  {!products.length?<div className="gen-empty library-empty"><span><FolderOpen size={30}/></span><h2>Your next product starts here.</h2><p>Choose Create product above to begin with AI, or bring content you’ve already made.</p></div>:!visible.length?<div className="gen-empty library-empty"><Search size={28}/><h2>No products found.</h2><p>Try another search or adjust your filters.</p><button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button></div>:null}
 </section>;
}
