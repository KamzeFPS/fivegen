'use client';

import {ArrowRight,Banknote,ChevronDown,Coins,CreditCard,FolderOpen,History,Link2,LogOut,Menu,MessageSquare,PanelLeftClose,PanelLeftOpen,Plus,ShieldCheck,TrendingUp,Users} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Brand} from './ui-brand';

type NavigationView='overview'|'library'|'crm'|'credits'|'connections'|'admin';
const navigation=[
  {id:'overview' as const,label:'Dashboard',icon:TrendingUp},
  {id:'library' as const,label:'Products',icon:FolderOpen},
  {id:'crm' as const,label:'Customers',icon:Users},
];
type Props={
  sidebarOpen:boolean;
  onToggleSidebar:()=>void;
  user:{name:string;email:string}|null;
  view:string;
  label:string;
  admin:boolean;
  productCount:number;
  creditsLabel:string;
  history:{id:string;title:string}[];
  onCreate:()=>void;
  onHome?:()=>void;
  onView:(view:NavigationView)=>void;
  onConversation:(id:string)=>void;
  onVisit:(path:string)=>void;
  onSignOut:()=>void;
};

export function WorkspaceNavigation({sidebarOpen=true,onToggleSidebar,user,view,label,admin,creditsLabel,history,onCreate,onHome,onView,onConversation,onVisit,onSignOut}:Props){
  const currentLabel=navigation.find(item=>item.id===view)?.label||({create:'New product',credits:'AI credits',connections:'Assistants',admin:'Settings'} as Record<string,string>)[view]||label;
  return <>
    <a className="workspace-skip" href="#workspace-content">Skip to content</a>
    <div className="workspace-sidebar-controls" data-sidebar-open={sidebarOpen}>
      <button type="button" className="workspace-sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarOpen?'Hide sidebar':'Open sidebar'} title={sidebarOpen?'Hide sidebar':'Open sidebar'} aria-expanded={sidebarOpen} aria-controls="workspace-navigation">
        {sidebarOpen?<PanelLeftClose size={20}/>:<PanelLeftOpen size={20}/>}<span>{sidebarOpen?'Hide sidebar':'Open sidebar'}</span>
      </button>
    </div>
    <header className="workspace-header" id="workspace-navigation" data-sidebar-open={sidebarOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className="workspace-mobile-menu" aria-label="Open workspace navigation"><Menu size={21}/></button></DropdownMenuTrigger>
        <DropdownMenuContent className="workspace-account-menu workspace-mobile-menu-content" align="start" sideOffset={10} collisionPadding={12}>
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {navigation.map(({id,label:navLabel,icon:Icon})=><DropdownMenuItem key={id} onSelect={()=>onView(id)} aria-current={view===id?'page':undefined}><Icon/>{navLabel}</DropdownMenuItem>)}
          <DropdownMenuSeparator/>
          <DropdownMenuItem onSelect={()=>onView('credits')} aria-current={view==='credits'?'page':undefined}><Coins/><span>AI credits</span><small className="workspace-menu-balance">{creditsLabel}</small></DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>onView('connections')} aria-current={view==='connections'?'page':undefined}><Link2/>Connect assistant</DropdownMenuItem>
          {history.length>0&&<><DropdownMenuSeparator/><DropdownMenuLabel>Recent plans</DropdownMenuLabel>{history.slice(0,5).map(item=><DropdownMenuItem key={item.id} onSelect={()=>onConversation(item.id)}><MessageSquare/><span>{item.title}</span></DropdownMenuItem>)}</>}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" className="workspace-brand" onClick={onHome||onCreate} aria-label="FiveGen home"><Brand/></button>
      <span className="workspace-mobile-current" aria-hidden="true">{currentLabel}</span>
      <button type="button" className="workspace-create-button" onClick={onCreate} aria-label="Create product" data-active={view==='create'}><Plus size={17}/><span>Create<span className="workspace-create-long"> product</span></span></button>
      <div className="workspace-navigation-scroll">
        <nav className="workspace-primary-nav" aria-label="Main navigation">
          {navigation.map(({id,label:navLabel,icon:Icon})=><button type="button" key={id} aria-current={view===id?'page':undefined} onClick={()=>onView(id)}><Icon size={18}/><span>{navLabel}</span></button>)}
        </nav>
        <nav className="workspace-secondary-nav" aria-label="Workspace tools">
          <button type="button" aria-current={view==='credits'?'page':undefined} onClick={()=>onView('credits')}><Coins size={18}/><span>AI credits</span><small>{creditsLabel.replace(/ credits$/,'')}</small></button>
          <button type="button" aria-current={view==='connections'?'page':undefined} onClick={()=>onView('connections')}><Link2 size={18}/><span>Connect assistant</span></button>
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="workspace-tools-trigger" aria-label="More workspace tools">More<ChevronDown size={14}/></button></DropdownMenuTrigger>
          <DropdownMenuContent className="workspace-account-menu workspace-tools-menu" align="end" sideOffset={8} collisionPadding={12}>
            <DropdownMenuItem onSelect={()=>onView('credits')} aria-current={view==='credits'?'page':undefined}><Coins/><span>AI credits</span><small className="workspace-menu-balance">{creditsLabel}</small></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>onView('connections')} aria-current={view==='connections'?'page':undefined}><Link2/>Connect assistant</DropdownMenuItem>
            {history.length>0&&<><DropdownMenuSeparator/><DropdownMenuLabel>Recent plans</DropdownMenuLabel>{history.slice(0,8).map(item=><DropdownMenuItem key={item.id} onSelect={()=>onConversation(item.id)}><MessageSquare/><span>{item.title}</span></DropdownMenuItem>)}</>}
          </DropdownMenuContent>
        </DropdownMenu>
        {history.length>0&&<DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="workspace-history-trigger" aria-label="Recent plans"><History size={18}/><span>Recent plans</span><ChevronDown size={13}/></button></DropdownMenuTrigger>
          <DropdownMenuContent className="workspace-history-menu" align="start" sideOffset={8} collisionPadding={12}>
            <DropdownMenuLabel>Recent plans</DropdownMenuLabel><DropdownMenuSeparator/>
            {history.slice(0,8).map(item=><DropdownMenuItem key={item.id} onSelect={()=>onConversation(item.id)}><MessageSquare/><span>{item.title}</span></DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <div className="workspace-header-actions">
        <button type="button" className="workspace-credit-button" onClick={()=>onView('credits')} aria-label={`AI credits: ${creditsLabel}`} title={`AI credits: ${creditsLabel}`}><Coins size={17}/><span>{creditsLabel}</span></button>
        {user?<DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="workspace-account-trigger" aria-label="Account menu" title="Account menu"><span className="workspace-avatar" aria-hidden="true">{(user.name.trim()[0]||user.email[0]||'F').toUpperCase()}</span><span className="workspace-account-name"><strong>{user.name}</strong><span>Account</span></span><ChevronDown size={13}/></button></DropdownMenuTrigger>
          <DropdownMenuContent className="workspace-account-menu" align="end" sideOffset={10} collisionPadding={12}>
            <DropdownMenuLabel className="workspace-account-identity"><strong>{user.name}</strong><span>{user.email}</span></DropdownMenuLabel>
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={()=>onVisit('/account/payments')}><Banknote/>Seller payments</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>onVisit('/account/billing')}><CreditCard/>Billing & receipts</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>onVisit('/pricing')}><Coins/>Plans & credits</DropdownMenuItem>
            {admin&&<DropdownMenuItem onSelect={()=>onView('admin')}><ShieldCheck/>Platform settings</DropdownMenuItem>}
            <DropdownMenuSeparator/>
            <DropdownMenuItem className="workspace-signout" onSelect={onSignOut}><LogOut/>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>:<a className="workspace-signin" href="/signin-with-chatgpt?return_to=%2F">Sign in<ArrowRight size={15}/></a>}
      </div>
    </header>
    <span className="workspace-current-view" aria-live="polite">{label}</span>
  </>;
}
