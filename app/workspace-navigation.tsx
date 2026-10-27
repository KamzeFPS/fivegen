'use client';

import {useState} from 'react';
import {ArrowRight,ChevronDown,CircleAlert,Coins,CreditCard,Banknote,FolderOpen,History,Link2,LogOut,MessageSquare,Plus,ShieldCheck,TrendingUp,Users,LifeBuoy,Scale,FileText,LockKeyhole,Mail,ExternalLink,BookOpen,ShoppingBag,Globe,CalendarDays} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger,DropdownMenuSub,DropdownMenuSubContent,DropdownMenuSubTrigger} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Brand} from './ui-brand';
import {WorkspaceSearch} from './workspace-search';
import {AppearanceMenuItems} from './appearance';

type NavigationView='overview'|'library'|'crm'|'credits'|'connections'|'creator-library'|'calendar'|'admin';
const navigation=[
  {id:'overview' as const,label:'Dashboard',icon:TrendingUp},
  {id:'library' as const,label:'Products',icon:FolderOpen},
  {id:'crm' as const,label:'Customers',icon:Users},
  {id:'creator-library' as const,label:'Creator library',icon:FolderOpen},
  {id:'calendar' as const,label:'Calendar',icon:CalendarDays},
];
type Props={
  user:{name:string;email:string}|null;
  view:string;
  label:string;
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

export function WorkspaceNavigation({user,view,label,admin,products,creditsLabel,history,onCreate,onChat,onHome,onView,onProduct,onConversation,onVisit,onSignOut}:Props){
  const [supportOpen,setSupportOpen]=useState(false);
  function visitChat(){
    if(onChat){onChat();return;}
    let id='';try{if(user)id=sessionStorage.getItem('fivegen:last-assistant-conversation:'+user.email)||'';}catch{}
    onVisit(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)?'/?conversation='+encodeURIComponent(id):'/?view=create');
  }
  const initials=(user?.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('')||user?.email[0]||'F').toUpperCase();
  return <>
    <a className="workspace-skip" href="#workspace-content">Skip to content</a>
    <header className="workspace-header">
      <div className="workspace-toolbar">
        <button type="button" className="workspace-brand" onClick={onHome||onCreate} aria-label="FiveGen home"><Brand/></button>
        <WorkspaceSearch products={products} history={history} admin={admin} onView={onView} onProduct={onProduct} onConversation={onConversation} onCreate={onCreate} onVisit={onVisit}/>
        <div className="workspace-header-actions">
          {!onChat&&<button type="button" className="workspace-chat-return" onClick={visitChat} aria-label="Return to chat with Gen" title="Return to chat with Gen"><MessageSquare size={18}/><span>Chat</span></button>}
          <div id="workspace-gen-slot" className="workspace-gen-slot"/>
          <button type="button" className="workspace-credit-button" onClick={()=>onView('credits')} aria-label={`AI credits: ${creditsLabel}`} title="AI credits"><Coins size={17}/><span>{creditsLabel}</span></button>
          <button type="button" className="workspace-help-trigger workspace-attention-trigger" onClick={()=>onVisit('/operations')} aria-label="Attention & support" title="Attention & support"><CircleAlert size={20}/></button>
          {user?<DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="workspace-account-trigger" aria-label="Account menu" title="Account menu"><span className="workspace-avatar" aria-hidden="true">{initials}</span><ChevronDown size={13}/></button></DropdownMenuTrigger>
            <DropdownMenuContent className="workspace-account-menu" align="end" sideOffset={10} collisionPadding={12}>
              <DropdownMenuLabel className="workspace-account-identity"><span className="workspace-avatar" aria-hidden="true">{initials}</span><div><strong>{user.name||'Your account'}</strong><span>{user.email}</span></div></DropdownMenuLabel>
              <DropdownMenuSeparator/>
              <DropdownMenuLabel className="workspace-menu-section">YOUR WORKSPACE</DropdownMenuLabel>
              <DropdownMenuItem onSelect={()=>onVisit('/operations')}><CircleAlert/><span>Attention & support</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onVisit('/account/payments')}><Banknote/><span>Get paid</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onVisit('/account/catalog')}><Globe/><span>Brand & catalog</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onVisit('/account/billing')}><CreditCard/><span>My FiveGen plan</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onView('creator-library')}><FolderOpen/><span>Creator library</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onView('calendar')}><CalendarDays/><span>Calendar</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onView('credits')}><Coins/><span>AI credits</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onVisit('/customer')}><ShoppingBag/><span>Your purchases</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onVisit('/collaborate')}><Users/><span>Shared with me</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onView('connections')}><Link2/><span>Connected assistants</span></DropdownMenuItem>
              {admin&&<DropdownMenuItem onSelect={()=>onView('admin')}><ShieldCheck/><span>Platform settings</span></DropdownMenuItem>}
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={()=>onVisit('/docs')}><BookOpen/><span>Documentation</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>setSupportOpen(true)}><LifeBuoy/><span>Help & support</span></DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Scale/><span>Legal & policies</span></DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="workspace-policy-menu" sideOffset={10} collisionPadding={12}>
                  <DropdownMenuItem onSelect={()=>onVisit('/terms')}><FileText/>Terms & conditions</DropdownMenuItem>
                  <DropdownMenuItem onSelect={()=>onVisit('/privacy')}><LockKeyhole/>Privacy policy</DropdownMenuItem>
                  <DropdownMenuItem onSelect={()=>onVisit('/refund')}><CreditCard/>Refund & cancellation</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator/>
              <DropdownMenuItem className="workspace-signout" onSelect={onSignOut}><LogOut/><span>Sign out</span><ArrowRight/></DropdownMenuItem>
              <DropdownMenuSeparator/>
              <AppearanceMenuItems/>
            </DropdownMenuContent>
          </DropdownMenu>:<a className="workspace-signin" href="/signin-with-chatgpt?return_to=%2F">Sign in<ArrowRight size={15}/></a>}
        </div>
      </div>
      <div className="workspace-nav-row">
        <nav className="workspace-primary-nav" aria-label="Main navigation">
          <button type="button" aria-current={view==='create'?'page':undefined} onClick={visitChat}><MessageSquare size={17}/><span>Chat with Gen</span></button>
          {navigation.map(({id,label:navLabel,icon:Icon})=><button type="button" key={id} aria-current={view===id?'page':undefined} onClick={()=>onView(id)}><Icon size={17}/><span>{navLabel}</span>{id==='library'&&products.length>0&&<small>{products.length}</small>}</button>)}
        </nav>
        <span className="sr-only">Current workspace: {label}</span>
        <div className="workspace-secondary-actions">
          {history.length>0&&<DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="workspace-history-trigger"><History size={16}/><span>Recent chats</span><ChevronDown size={12}/></button></DropdownMenuTrigger>
            <DropdownMenuContent className="workspace-history-menu" align="end" sideOffset={10} collisionPadding={12}>
              <DropdownMenuLabel>Pick up where you left off</DropdownMenuLabel><DropdownMenuSeparator/>
              {history.slice(0,8).map(item=><DropdownMenuItem key={item.id} onSelect={()=>onConversation(item.id)}><MessageSquare/><span>{item.title}</span></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
          <button type="button" className="workspace-create-button" onClick={onCreate} aria-label="Create your product" data-active={view==='create'}><Plus size={17}/><span>Create product</span></button>
        </div>
      </div>
    </header>
    <Dialog open={supportOpen} onOpenChange={setSupportOpen}><DialogContent className="workspace-support-dialog"><DialogHeader><span className="workspace-support-icon"><LifeBuoy size={25}/></span><DialogTitle>A little help, when you need it.</DialogTitle><DialogDescription>Questions about your workspace, billing, or a product? Contact FiveGen support.</DialogDescription></DialogHeader><button type="button" className="button secondary" onClick={()=>{setSupportOpen(false);onVisit('/docs');}}>Explore FiveGen guides<ArrowRight size={16}/></button><a className="workspace-support-email" href="mailto:kamzewac@gmail.com?subject=FiveGen%20support"><Mail size={19}/><span><strong>Email support</strong><small>kamzewac@gmail.com</small></span><ExternalLink size={16}/></a><p className="workspace-support-note">Include the product name and what you were trying to do.</p></DialogContent></Dialog>
  </>;
}
