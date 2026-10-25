'use client';

import {useState,type MouseEvent} from 'react';
import {Archive,ArchiveRestore,ArrowRight,BookOpen,CalendarDays,ChevronDown,ChevronRight,FileText,FolderOpen,GraduationCap,LayoutGrid,Layers3,List,MoreHorizontal,Search,SlidersHorizontal,Trash2,Upload,Users,X} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import type {Product} from '@/lib/product';
import {builderTypeDetails} from '@/lib/builder-contract';
import {selectWorkspaceProducts,workspaceProductDestination,workspaceProductPublished,workspaceProductCommercialState,type ProductFilter,type ProductSort,type WorkspaceBuilderSummary,type WorkspaceFileSummary} from '@/lib/workspace-library';
import {WorkspaceExample} from './workspace-example';
import {ProductArchiveDialog} from './product-archive-dialog';
import {ProductDeleteDialog} from './product-delete-dialog';

function ProductFormatIcon({format}:{format:string}){
 if(/course/i.test(format))return <GraduationCap size={24} strokeWidth={1.5}/>;
 if(/coaching|consulting/i.test(format))return <CalendarDays size={24} strokeWidth={1.5}/>;
 if(format==='Community')return <Users size={24} strokeWidth={1.5}/>;
 if(format==='Template kit')return <Layers3 size={24} strokeWidth={1.5}/>;
 return /book|guide/i.test(format)?<BookOpen size={24} strokeWidth={1.5}/>:<FileText size={24} strokeWidth={1.5}/>;
}

function ProductArtwork({product,url}:{product:Product;url?:string}){
 const [failed,setFailed]=useState(false);
 if(url&&!failed)return <span className="library-artwork library-artwork-image" aria-hidden="true"><img src={url} alt="" loading="lazy" onError={()=>setFailed(true)}/></span>;
 return <span className="library-artwork" aria-hidden="true"><ProductFormatIcon format={product.format}/></span>;
}

/** Ordinary navigation uses the workspace guard; browser shortcuts remain native. */
export function openWorkspaceProductLink(event:Pick<MouseEvent<HTMLAnchorElement>,'button'|'metaKey'|'ctrlKey'|'shiftKey'|'altKey'|'defaultPrevented'|'preventDefault'>,product:Product,onOpen:(product:Product)=>void){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();onOpen(product);
}

export function WorkspaceProductLibrary({products,builders=[],files=[],onOpen,onCreateFrom,onDeletedProduct}:{products:Product[];builders?:WorkspaceBuilderSummary[];files?:WorkspaceFileSummary[];onOpen:(product:Product)=>void;onCreateFrom:(source:'upload'|'manual')=>void;onDeletedProduct?:(productId:string)=>void}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState<ProductFilter>('all'),[format,setFormat]=useState('all'),[sort,setSort]=useState<ProductSort>('updated'),[layout,setLayout]=useState<'grid'|'list'>('grid');
 const [archiveProduct,setArchiveProduct]=useState<Product|null>(null);
 const [deleteProduct,setDeleteProduct]=useState<Product|null>(null);
 const publicPages=products.filter(product=>!product.archivedAt&&(builders.find(item=>item.productId===product.id)||files.find(item=>item.productId===product.id))?.salesPagePublic===true).length;
 const counts={all:products.filter(product=>!product.archivedAt).length,archived:products.filter(product=>!!product.archivedAt).length,public:publicPages,selling:products.filter(product=>!product.archivedAt&&(builders.find(item=>item.productId===product.id)||files.find(item=>item.productId===product.id))?.selling===true).length,draft:selectWorkspaceProducts(products,{status:'draft',builders,files}).length};
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
   <div className="library-status-row"><div className="library-filters" role="group" aria-label="Filter by product launch status">{(['all','public','selling','draft','archived'] as const).map(key=><button type="button" key={key} aria-pressed={status===key} onClick={()=>setStatus(key)}>{key==='all'?'All products':key==='public'?'Public page':key==='selling'?'Selling':key==='archived'?'Archived':'Drafts'}<span>{counts[key]}</span></button>)}</div><div className={`library-result-count ${filtered?'':'is-unfiltered'}`} role="status"><span>{visible.length}{filtered?' of '+products.length:''} product{visible.length===1?'':'s'}</span>{filtered&&<button type="button" onClick={clearFilters}>Reset</button>}</div></div>
  </div>
  <div className={`library-products library-products-${layout}`}>{visible.map(product=>{
   const builder=builders.find(item=>item.productId===product.id),file=files.find(item=>item.productId===product.id),isPublished=workspaceProductPublished(product,builders,files),info=builder&&builderTypeDetails[builder.type];
   const details=builder?`${builder.unitCount} ${builder.unitCount===1?info?.unit.toLowerCase()||'section':info?.plural||'sections'}${builder.uploadCount?` · ${builder.uploadCount} file${builder.uploadCount===1?'':'s'}`:''}`:file?'Files & private delivery':`${product.content.sections.length} section${product.content.sections.length===1?'':'s'}`;
   const commercial=workspaceProductCommercialState(product,builders,files);
   const href=workspaceProductDestination(product,builders,files)||'/?project='+encodeURIComponent(product.id)+'&area=content';
   return <div className="library-product-card" key={product.id}><a className="library-product" href={href} onClick={event=>{if(product.archivedAt){event.preventDefault();setArchiveProduct(product);}else openWorkspaceProductLink(event,product,onOpen);}} aria-label={`Open ${product.title}`}><ProductArtwork product={product} url={builder?.coverUrl||file?.coverUrl}/><span className="library-product-details"><strong className="library-product-title">{product.title}</strong><span className="library-product-meta">{product.format}<span aria-hidden="true">·</span>{details}</span><span className={`library-status ${commercial.tone==='selling'?'is-selling':isPublished?'is-published':''}`}><i/>{commercial.label}</span><span className="library-product-next">{commercial.detail}<ArrowRight size={12}/></span></span><ChevronRight className="library-product-arrow" size={18} aria-hidden="true"/></a><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="library-product-menu-trigger" aria-label={`Actions for ${product.title}`} title="Product actions"><MoreHorizontal size={19}/></button></DropdownMenuTrigger><DropdownMenuContent className="library-product-menu" align="end" sideOffset={6} collisionPadding={12}><DropdownMenuItem onSelect={()=>setArchiveProduct(product)}>{product.archivedAt?<ArchiveRestore size={16}/>:<Archive size={16}/>} {product.archivedAt?'Restore product…':'Archive product…'}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={()=>setDeleteProduct(product)}><Trash2 size={16}/>Delete product…</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
  })}</div>
  {!products.length?<div className="gen-empty library-empty"><FolderOpen size={30}/><h2>No products yet</h2><p>Bring your own recordings or files, teach something new, or offer a service. You choose when to use AI.</p><button type="button" className="button primary" onClick={()=>onCreateFrom('manual')}>Create your first product<ArrowRight size={16}/></button><button type="button" className="button secondary" onClick={()=>onCreateFrom('upload')}>Upload existing content</button><WorkspaceExample kind="product"/></div>:!visible.length&&!filtered&&counts.archived>0?<div className="gen-empty library-empty"><Archive size={28}/><h2>Your products are archived</h2><p>Your work and customer history are kept. Restore a product when you are ready to work on it again.</p><button type="button" className="button secondary" onClick={()=>setStatus('archived')}>View archived products</button></div>:!visible.length?<div className="gen-empty library-empty"><Search size={28}/><h2>No products found</h2><p>Try another search or adjust your filters.</p><button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button></div>:null}
  {archiveProduct&&<ProductArchiveDialog product={archiveProduct} onClose={()=>setArchiveProduct(null)}/>}
  {deleteProduct&&<ProductDeleteDialog key={deleteProduct.id} product={deleteProduct} open onOpenChange={open=>{if(!open)setDeleteProduct(null);}} onDeleted={()=>{const deletedId=deleteProduct.id;setDeleteProduct(null);if(onDeletedProduct)onDeletedProduct(deletedId);else window.location.reload();}}/>}
 </section>;
}
