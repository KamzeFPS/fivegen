'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,ChevronDown,CircleAlert,Coins,CreditCard,Banknote,FolderOpen,History,Home,Link2,LogOut,Megaphone,Menu,MessageSquare,Palette,Settings2,ShieldCheck,TrendingUp,Users,LifeBuoy,Scale,FileText,LockKeyhole,Mail,ExternalLink,BookOpen,ShoppingBag,Globe,CalendarDays} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger,DropdownMenuSub,DropdownMenuSubContent,DropdownMenuSubTrigger} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Brand} from './ui-brand';
import {WorkspaceSearch} from './workspace-search';
import {AppearanceMenuItems} from './appearance';

type NavigationView='overview'|'library'|'marketing'|'design'|'crm'|'credits'|'connections'|'creator-library'|'domains'|'calendar'|'admin';
const navigation=[
  {id:'create',label:'Home',icon:Home},
  {id:'library',label:'My products',icon:FolderOpen},
  {id:'marketing',label:'Marketing',icon:Megaphone},
  {id:'design',label:'Design',icon:Palette},
  {id:'calendar',label:'Calendar',icon:CalendarDays},
  {id:'crm',label:'Customers',icon:Users},
  {id:'creator-library',label:'Library',icon:BookOpen},
  {id:'domains',label:'Domains',icon:Globe},
] as const;
type Props={
  user:{name:string;email:string}|null;
  view:string;
  label:string;
  productContext?:boolean;
  admin:boolean;
  products:{id:string;title:string;format:string}[];
  creditsLabel:string;
  history:{id:string;title:string}[];
  onCreate:()=>void;
  onChat?:()=>void;
  onHome?:()=>void;
  onView:(view:NavigationView)=>void;
  onProduct:(id:string)=>void;
  onConversation:(id:string)=>void;
  onVisit:(path:string)=>void;
  onSignOut:()=>void;
};

export function WorkspaceNavigation({user,view,label,admin,products,creditsLabel,history,productContext,onCreate,onView,onProduct,onConversation,onVisit,onSignOut}:Props){
  const [supportOpen,setSupportOpen]=useState(false),[menuOpen,setMenuOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(false),[drawerMode,setDrawerMode]=useState(false);
  const pendingNavigation=useRef<(()=>void)|null>(null),headerRef=useRef<HTMLElement>(null),toggleRef=useRef<HTMLButtonElement>(null),menuId=useId(),sidebarId=menuId+'-sidebar';
  useEffect(()=>{let active=true;const read=()=>{if(!active)return;try{setCollapsed(localStorage.getItem('fivegen.workspace-navigation-collapsed')==='true');}catch{}};queueMicrotask(read);window.addEventListener('storage',read);return()=>{active=false;window.removeEventListener('storage',read);};},[]);
  useEffect(()=>{let active=true;const update=()=>{if(active)setDrawerMode(window.matchMedia('(max-width: 900px)').matches||(productContext??Boolean(headerRef.current?.nextElementSibling?.classList.contains('has-product'))));};queueMicrotask(update);window.addEventListener('resize',update);return()=>{active=false;window.removeEventListener('resize',update);};},[view,label,productContext]);
  function toggleNavigation(){if(drawerMode){setMenuOpen(value=>!value);return;}setCollapsed(value=>{const next=!value;try{localStorage.setItem('fivegen.workspace-navigation-collapsed',String(next));}catch{}return next;});}
  function navigate(action:()=>void){if(menuOpen){pendingNavigation.current=action;setMenuOpen(false);}else action();}
  function home(){navigate(()=>onVisit('/?view=create'));}
  function destination(id:typeof navigation[number]['id']){if(id==='create')home();else navigate(()=>onView(id));}
  const initials=(user?.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('')||user?.email[0]||'F').toUpperCase();
  const accountMenu=<>
    <DropdownMenuLabel className="workspace-account-identity"><span className="workspace-avatar" aria-hidden="true">{initials}</span><div><strong>{user?.name||'Your account'}</strong><span>{user?.email}</span></div></DropdownMenuLabel>
    <DropdownMenuSeparator/>
    <DropdownMenuLabel className="workspace-menu-section">YOUR WORKSPACE</DropdownMenuLabel>
    <DropdownMenuItem onSelect={()=>navigate(()=>onView('overview'))}><TrendingUp/><span>Results & dashboard</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/operations'))}><CircleAlert/><span>Attention & support</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/account/payments'))}><Banknote/><span>Get paid</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/account/catalog'))}><Globe/><span>Brand & catalog</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/account/billing'))}><CreditCard/><span>My FiveGen plan</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onView('credits'))}><Coins/><span>AI credits</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/customer'))}><ShoppingBag/><span>Your purchases</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/collaborate'))}><Users/><span>Shared with me</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>onView('connections'))}><Link2/><span>Connected assistants</span></DropdownMenuItem>
    {admin&&<DropdownMenuItem onSelect={()=>navigate(()=>onView('admin'))}><ShieldCheck/><span>Platform settings</span></DropdownMenuItem>}
    <DropdownMenuSeparator/>
    <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/docs'))}><BookOpen/><span>Documentation</span></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>navigate(()=>setSupportOpen(true))}><LifeBuoy/><span>Help & support</span></DropdownMenuItem>
    <DropdownMenuSub><DropdownMenuSubTrigger><Scale/><span>Legal & policies</span></DropdownMenuSubTrigger><DropdownMenuSubContent className="workspace-policy-menu" sideOffset={10} collisionPadding={12}>
      <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/terms'))}><FileText/>Terms & conditions</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/privacy'))}><LockKeyhole/>Privacy policy</DropdownMenuItem>
      <DropdownMenuItem onSelect={()=>navigate(()=>onVisit('/refund'))}><CreditCard/>Refund & cancellation</DropdownMenuItem>
    </DropdownMenuSubContent></DropdownMenuSub>
    <DropdownMenuSeparator/>
    <DropdownMenuItem className="workspace-signout" onSelect={()=>navigate(onSignOut)}><LogOut/><span>Sign out</span><ArrowRight/></DropdownMenuItem>
    <DropdownMenuSeparator/><AppearanceMenuItems/>
  </>;
  const navigationBody=<>
    <nav className="workspace-global-nav" aria-label="Main navigation">{navigation.map(({id,label:navLabel,icon:Icon})=><button type="button" key={id} aria-current={view===id?'page':undefined} onClick={()=>destination(id)}><Icon size={20} aria-hidden="true"/><span>{navLabel}</span>{id==='library'&&products.length>0&&<small>{products.length}</small>}</button>)}</nav>
    {(products.length>0||history.length>0)&&<section className="workspace-sidebar-recent" aria-label="Recent work">{products.length>0&&<><h2>Recent</h2>{products.slice(0,3).map(product=><button type="button" key={product.id} onClick={()=>navigate(()=>onProduct(product.id))}><FileText size={18} aria-hidden="true"/><span title={product.title}>{product.title}</span></button>)}</>}{history.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="workspace-history-trigger"><History size={17} aria-hidden="true"/><span>Recent chats</span><ChevronDown size={12} aria-hidden="true"/></button></DropdownMenuTrigger><DropdownMenuContent className="workspace-history-menu" align="start" sideOffset={8} collisionPadding={12}><DropdownMenuLabel>Pick up where you left off</DropdownMenuLabel><DropdownMenuSeparator/>{history.slice(0,8).map(item=><DropdownMenuItem key={item.id} onSelect={()=>navigate(()=>onConversation(item.id))}><MessageSquare/><span>{item.title}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}</section>}
    <div className="workspace-sidebar-footer"><button type="button" onClick={()=>navigate(()=>setSupportOpen(true))}><LifeBuoy size={20} aria-hidden="true"/><span>Help & support</span></button>{user?<DropdownMenu><DropdownMenuTrigger asChild><button type="button"><Settings2 size={20} aria-hidden="true"/><span>Settings</span></button></DropdownMenuTrigger><DropdownMenuContent className="workspace-account-menu" align="start" side="right" sideOffset={12} collisionPadding={12}>{accountMenu}</DropdownMenuContent></DropdownMenu>:<a href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcreate"><Settings2 size={20} aria-hidden="true"/>Sign in</a>}</div>
  </>;
  return <>
    <a className="workspace-skip" href="#workspace-content">Skip to content</a>
    <header className="workspace-header" ref={headerRef} data-navigation-collapsed={collapsed?'true':undefined}>
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-start"><button ref={toggleRef} type="button" className="workspace-menu-trigger" aria-label={(drawerMode?menuOpen:!collapsed)?'Hide navigation':'Show navigation'} aria-expanded={drawerMode?menuOpen:!collapsed} aria-controls={drawerMode?menuId:sidebarId} onClick={toggleNavigation}><Menu size={21}/></button><button type="button" className="workspace-brand" onClick={home} aria-label="FiveGen home"><Brand/></button></div>
        <WorkspaceSearch products={products} history={history} admin={admin} onView={onView} onProduct={onProduct} onConversation={onConversation} onCreate={onCreate} onVisit={onVisit}/>
        <div className="workspace-header-actions"><div id="workspace-gen-slot" className="workspace-gen-slot"/><button type="button" className="workspace-credit-button" onClick={()=>onView('credits')} aria-label={`AI credits: ${creditsLabel}`} title="AI credits"><Coins size={17}/><span>{creditsLabel}</span></button>{user?<DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="workspace-account-trigger" aria-label="Account menu" title="Account menu"><span className="workspace-avatar" aria-hidden="true">{initials}</span><ChevronDown size={13}/></button></DropdownMenuTrigger><DropdownMenuContent className="workspace-account-menu" align="end" sideOffset={10} collisionPadding={12}>{accountMenu}</DropdownMenuContent></DropdownMenu>:<a className="workspace-signin" href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcreate">Sign in<ArrowRight size={15}/></a>}</div>
      </div>
      <aside id={sidebarId} className="workspace-global-sidebar" aria-label="Your workspace">{navigationBody}</aside>
      <span className="sr-only">Current workspace: {label}</span>
    </header>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent id={menuId} className="workspace-navigation-drawer" onCloseAutoFocus={event=>{const action=pendingNavigation.current;pendingNavigation.current=null;event.preventDefault();toggleRef.current?.focus({preventScroll:true});if(action)action();}}><DialogHeader><DialogTitle>Your workspace</DialogTitle><DialogDescription className="sr-only">Choose a workspace area or continue a recent product.</DialogDescription></DialogHeader>{navigationBody}</DialogContent></Dialog>
    <Dialog open={supportOpen} onOpenChange={setSupportOpen}><DialogContent className="workspace-support-dialog"><DialogHeader><span className="workspace-support-icon"><LifeBuoy size={25}/></span><DialogTitle>A little help, when you need it.</DialogTitle><DialogDescription>Questions about your workspace, billing, or a product? Contact FiveGen support.</DialogDescription></DialogHeader><button type="button" className="button secondary" onClick={()=>{setSupportOpen(false);onVisit('/docs');}}>Explore FiveGen guides<ArrowRight size={16}/></button><a className="workspace-support-email" href="mailto:kamzewac@gmail.com?subject=FiveGen%20support"><Mail size={19}/><span><strong>Email support</strong><small>kamzewac@gmail.com</small></span><ExternalLink size={16}/></a><p className="workspace-support-note">Include the product name and what you were trying to do.</p></DialogContent></Dialog>
  </>;
}
