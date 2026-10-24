'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Coins,CreditCard,FolderOpen,Link2,MessageSquare,Plus,Search,ShieldCheck,TrendingUp,Users} from 'lucide-react';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';
import {Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';

type NavigationView='overview'|'library'|'crm'|'credits'|'connections'|'creator-library'|'admin';
export type WorkspaceSearchProps={
  products:{id:string;title:string;format:string}[];
  history:{id:string;title:string}[];
  admin:boolean;
  onView:(view:NavigationView)=>void;
  onProduct:(id:string)=>void;
  onConversation:(id:string)=>void;
  onCreate:()=>void;
  onVisit:(path:string)=>void;
};

function searchText(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
}

export function WorkspaceSearch({products,history,admin,onView,onProduct,onConversation,onCreate,onVisit}:WorkspaceSearchProps){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [shortcut,setShortcut]=useState('⌘ / Ctrl');
  const triggerRef=useRef<HTMLButtonElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const pendingAction=useRef<(()=>void)|null>(null);

  const openSearch=(nextOpen:boolean)=>{
    if(nextOpen){setQuery('');pendingAction.current=null;}
    setOpen(nextOpen);
  };

  useEffect(()=>{
    let mounted=true;queueMicrotask(()=>{if(mounted)setShortcut(/Mac|iPhone|iPad|iPod/i.test(navigator.platform)?'⌘':'Ctrl');});return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key.toLowerCase()!=='k'||!(event.metaKey||event.ctrlKey)||event.altKey||event.repeat)return;
      const anotherSurfaceOpen=Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]')).some(element=>
        element!==dialogRef.current&&!dialogRef.current?.contains(element)&&element.dataset.state!=='closed'&&element.getAttribute('aria-hidden')!=='true'&&element.getClientRects().length>0
      );
      if(anotherSurfaceOpen)return;
      event.preventDefault();
      if(open){inputRef.current?.focus();return;}
      setQuery('');
      pendingAction.current=null;
      setOpen(true);
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>document.removeEventListener('keydown',onKeyDown);
  },[open]);

  const actions=useMemo(()=>[
    {id:'create',label:'Create a product',description:'Start something new',keywords:'new offer course',icon:Plus,run:onCreate},
    {id:'overview',label:'Overview',description:'Your results and next step',keywords:'dashboard analytics growth',icon:TrendingUp,run:()=>onView('overview')},
    {id:'library',label:'Products',description:'Content, checkout, and marketing',keywords:'library vsl funnel campaigns',icon:FolderOpen,run:()=>onView('library')},
    {id:'crm',label:'Customers',description:'Contacts and your lead pipeline',keywords:'crm leads contacts',icon:Users,run:()=>onView('crm')},
    {id:'creator-library',label:'Creator library',description:'Private profile and reusable sources',keywords:'voice references recordings stories expertise',icon:FolderOpen,run:()=>onView('creator-library')},
    {id:'credits',label:'AI credits',description:'Your balance and credit options',keywords:'plans pricing generation wallet',icon:Coins,run:()=>onView('credits')},
    {id:'billing',label:'Account & billing',description:'Manage your subscription',keywords:'payment invoices settings account profile',icon:CreditCard,run:()=>onVisit('/account/billing')},
    {id:'connections',label:'Connect assistant',description:'Connect your AI workspace',keywords:'integrations connection mcp chatgpt',icon:Link2,run:()=>onView('connections')},
    ...(admin?[{id:'admin',label:'Platform settings',description:'Administration tools',keywords:'admin settings',icon:ShieldCheck,run:()=>onView('admin')}]:[]),
  ],[admin,onCreate,onView,onVisit]);
  const terms=searchText(query.trim()).split(/\s+/).filter(Boolean);
  const matches=(value:string)=>terms.every(term=>searchText(value).includes(term));
  const productResults=terms.length?products.filter(product=>matches(`${product.title} ${product.format}`)):products.slice(0,8);
  const planResults=terms.length?history.filter(plan=>matches(plan.title)):history.slice(0,8);
  const actionResults=actions.filter(action=>matches(`${action.label} ${action.description} ${action.keywords}`));

  const select=(action:()=>void)=>{
    // Wait for the modal to close before a destination can open an unsaved-edit guard.
    pendingAction.current=action;
    setOpen(false);
  };

  return <Dialog open={open} onOpenChange={openSearch}>
    <DialogTrigger asChild>
      <button ref={triggerRef} type="button" className="workspace-search-trigger" aria-label="Search your workspace" aria-keyshortcuts="Meta+K Control+K" title="Search your workspace">
        <Search size={18} aria-hidden="true"/>
        <span>Search your workspace…</span>
        <kbd aria-hidden="true">{shortcut} K</kbd>
      </button>
    </DialogTrigger>
    <DialogContent ref={dialogRef} className="workspace-search-dialog" showCloseButton={false} onOpenAutoFocus={event=>{event.preventDefault();inputRef.current?.focus();}} onCloseAutoFocus={event=>{
      event.preventDefault();
      triggerRef.current?.focus();
      const action=pendingAction.current;
      pendingAction.current=null;
      action?.();
    }}>
      <DialogTitle className="sr-only">Search your workspace</DialogTitle>
      <DialogDescription className="sr-only">Find a product or recent plan, or jump to a workspace page. Use the arrow keys to choose a result and Enter to open it.</DialogDescription>
      <Command className="workspace-search-command" shouldFilter={false} loop>
        <div className="workspace-search-input-row">
          <CommandInput ref={inputRef} value={query} onValueChange={setQuery} placeholder="Find a product, plan, or page…" aria-label="Search products, plans, and pages"/>
          <button type="button" className="workspace-search-close" onClick={()=>openSearch(false)} aria-label="Close search">Esc</button>
        </div>
        <CommandList className="workspace-search-results" aria-label="Workspace search results">
          <CommandEmpty><strong>No results found</strong><span>Try another product name, plan title, or page.</span></CommandEmpty>
          {productResults.length>0&&<CommandGroup heading="Products">
            {productResults.map(product=><CommandItem key={product.id} value={`product-${product.id}`} onSelect={()=>select(()=>onProduct(product.id))}>
              <span className="workspace-search-result-icon"><FolderOpen aria-hidden="true"/></span>
              <span className="workspace-search-result-copy"><strong>{product.title}</strong><small>{product.format.replace(/[_-]+/g,' ')}</small></span>
              <ArrowUpRight className="workspace-search-result-arrow" aria-hidden="true"/>
            </CommandItem>)}
          </CommandGroup>}
          {planResults.length>0&&<CommandGroup heading="Recent plans">
            {planResults.map(plan=><CommandItem key={plan.id} value={`plan-${plan.id}`} onSelect={()=>select(()=>onConversation(plan.id))}>
              <span className="workspace-search-result-icon"><MessageSquare aria-hidden="true"/></span>
              <span className="workspace-search-result-copy"><strong>{plan.title}</strong><small>Continue planning</small></span>
              <ArrowUpRight className="workspace-search-result-arrow" aria-hidden="true"/>
            </CommandItem>)}
          </CommandGroup>}
          {actionResults.length>0&&<CommandGroup heading="Go to">
            {actionResults.map(({id,label,description,icon:Icon,run})=><CommandItem key={id} value={`page-${id}`} onSelect={()=>select(run)}>
              <span className="workspace-search-result-icon"><Icon aria-hidden="true"/></span>
              <span className="workspace-search-result-copy"><strong>{label}</strong><small>{description}</small></span>
              <ArrowUpRight className="workspace-search-result-arrow" aria-hidden="true"/>
            </CommandItem>)}
          </CommandGroup>}
        </CommandList>
        <div className="workspace-search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
      </Command>
    </DialogContent>
  </Dialog>;
}
