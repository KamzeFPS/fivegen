'use client';

import {useState,type MouseEvent} from 'react';
import {ArrowRight,BookOpen,CalendarDays,ChevronDown,ChevronRight,FileText,FolderOpen,GraduationCap,LayoutGrid,Layers3,List,Search,SlidersHorizontal,Upload,Users,X} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import type {Product} from '@/lib/product';
import {builderTypeDetails} from '@/lib/builder-contract';
import {selectWorkspaceProducts,workspaceProductDestination,workspaceProductPublished,type ProductFilter,type ProductSort,type WorkspaceBuilderSummary,type WorkspaceFileSummary} from '@/lib/workspace-library';

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
 return <span className="library-artwork" aria-hidden="true"><Icon size={24} strokeWidth={1.5}/></span>;
}

/** Ordinary navigation uses the workspace guard; browser shortcuts remain native. */
export function openWorkspaceProductLink(event:Pick<MouseEvent<HTMLAnchorElement>,'button'|'metaKey'|'ctrlKey'|'shiftKey'|'altKey'|'defaultPrevented'|'preventDefault'>,product:Product,onOpen:(product:Product)=>void){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();onOpen(product);
}

export function WorkspaceProductLibrary({products,builders=[],files=[],onOpen,onCreateFrom}:{products:Product[];builders?:WorkspaceBuilderSummary[];files?:WorkspaceFileSummary[];onOpen:(product:Product)=>void;onCreateFrom:(source:'upload'|'manual')=>void}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState<ProductFilter>('all'),[format,setFormat]=useState('all'),[sort,setSort]=useState<ProductSort>('updated'),[layout,setLayout]=useState<'grid'|'list'>('grid');
 const published=products.filter(product=>workspaceProductPublished(product,builders,files)).length;
 const counts={all:products.length,published,draft:products.length-published};
 const visible=selectWorkspaceProducts(products,{query,status,format,sort,builders,files});
 const formats=[...new Set(products.map(product=>product.format))].sort();
 const filtered=!!query.trim()||status!=='all'||format!=='all';
 function clearFilters(){setQuery('');setStatus('all');setFormat('all');}
 const typeSelect=<label className="library-select"><span>Type</span><select aria-label="Product type" value={format} onChange={event=>setFormat(event.target.value)}><option value="all">All types</option>{formats.map(value=><option key={value}>{value}</option>)}</select></label>;
 const sortSelect=<label className="library-select library-sort"><span>Sort</span><select aria-label="Sort products" value={sort} onChange={event=>setSort(event.target.value as ProductSort)}><option value="updated">Last edited</option><option value="title">Name A–Z</option></select></label>;
 return <section className="gen-library gen-enter workspace-library" aria-labelledby="library-title">
  <header className="library-heading"><h1 id="library-title">Products</h1><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="library-add-content"><Upload size={16}/><span>Add content</span><ChevronDown size={14}/></button></DropdownMenuTrigger><DropdownMenuContent className="library-add-menu" align="end" sideOffset={8} collisionPadding={12}><DropdownMenuItem onSelect={()=>onCreateFrom('upload')}><Upload size={16}/>Upload existing content</DropdownMenuItem><DropdownMenuItem onSelect={()=>onCreateFrom('manual')}><FileText size={16}/>Start manually</DropdownMenuItem></DropdownMenuContent></DropdownMenu></header>
  <div className="library-controls">
   <div className="library-search-row"><label className="library-search"><Search size={18}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search products" aria-label="Search products"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label><div className="library-desktop-selects">{typeSelect}{sortSelect}</div><Popover><PopoverTrigger asChild><button type="button" className="library-mobile-filters" aria-label="Filter products" data-active={format!=='all'||sort!=='updated'}><SlidersHorizontal size={18}/></button></PopoverTrigger><PopoverContent className="library-filter-popover" align="end" sideOffset={8} collisionPadding={12}><h2>Type and sort</h2><div onKeyDown={event=>event.stopPropagation()}>{typeSelect}{sortSelect}</div></PopoverContent></Popover><div className="library-layout" role="group" aria-label="Product layout"><button type="button" aria-label="Grid view" title="Grid view" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><LayoutGrid size={17}/></button><button type="button" aria-label="List view" title="List view" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><List size={18}/></button></div></div>
   <div className="library-status-row"><div className="library-filters" role="group" aria-label="Filter by publication status">{(['all','published','draft'] as const).map(key=><button type="button" key={key} aria-pressed={status===key} onClick={()=>setStatus(key)}>{key==='all'?'All products':key==='published'?'Published':'Drafts'}<span>{counts[key]}</span></button>)}</div><div className={`library-result-count ${filtered?'':'is-unfiltered'}`} role="status"><span>{visible.length}{filtered?' of '+products.length:''} product{visible.length===1?'':'s'}</span>{filtered&&<button type="button" onClick={clearFilters}>Reset</button>}</div></div>
  </div>
  <div className={`library-products library-products-${layout}`}>{visible.map(product=>{
   const builder=builders.find(item=>item.productId===product.id),file=files.find(item=>item.productId===product.id),isPublished=workspaceProductPublished(product,builders,files),info=builder&&builderTypeDetails[builder.type];
   const details=builder?`${builder.unitCount} ${builder.unitCount===1?info?.unit.toLowerCase()||'section':info?.plural||'sections'}${builder.uploadCount?` · ${builder.uploadCount} file${builder.uploadCount===1?'':'s'}`:''}`:file?'Files & private delivery':`${product.content.sections.length} section${product.content.sections.length===1?'':'s'}`;
   const href=workspaceProductDestination(product,builders,files)||'/?project='+encodeURIComponent(product.id)+'&area=content';
   return <a className="library-product" key={product.id} href={href} onClick={event=>openWorkspaceProductLink(event,product,onOpen)} aria-label={`Open ${product.title}`}><ProductArtwork product={product} url={builder?.coverUrl||file?.coverUrl}/><span className="library-product-details"><strong className="library-product-title">{product.title}</strong><span className="library-product-meta">{product.format}<span aria-hidden="true">·</span>{details}</span><span className={`library-status ${isPublished?'is-published':''}`}><i/>{isPublished?'Published':'Draft'}</span></span><ChevronRight className="library-product-arrow" size={18} aria-hidden="true"/></a>;
  })}</div>
  {!products.length?<div className="gen-empty library-empty"><FolderOpen size={30}/><h2>No products yet</h2><p>Create a product with AI, or use Add content to bring your own files.</p></div>:!visible.length?<div className="gen-empty library-empty"><Search size={28}/><h2>No products found</h2><p>Try another search or adjust your filters.</p><button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button></div>:null}
 </section>;
}
