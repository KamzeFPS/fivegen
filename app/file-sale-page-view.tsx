import type {ReactNode} from 'react';
import {FileText,GraduationCap,ShieldCheck,Check,ArrowUpRight} from 'lucide-react';
import type {SaleDraft} from '@/lib/file-sale-contract';
import {Brand} from './ui-brand';
import './file-sale.css';

// The seller preview and the public page render this exact component. Only
// included module summaries are public; lessons and file URLs remain private.
export function FileSalePageView({snapshot,preview=false,children,coverUrl}:{snapshot:SaleDraft;preview?:boolean;children?:ReactNode;coverUrl?:string}){
 const included=snapshot.modules.filter(m=>m.included);
 const Container=preview?'div':'main';
 return <div className="fs-public">
  <nav className="fs-public-nav"><a href="/" aria-label="FiveGen home"><Brand tone="dark"/></a><span>{preview?'Buyer preview · not published':'Sandbox product · test purchases only'}</span></nav>
  <Container className="fs-public-main">
   <section className="fs-public-intro"><div className="fs-eyebrow">DIRECT FROM THE CREATOR</div><h1>{snapshot.title||'Your product title'}</h1><p className="fs-public-description">{snapshot.description||'Describe the result your customer will get.'}</p>
   <div className="fs-public-includes"><h2>Included with your purchase</h2>{included.length?included.map(m=><div key={m.kind}><Check size={17}/><span><strong>{m.name}</strong><small>{m.kind==='downloads'?`${m.uploadIds.length} private file${m.uploadIds.length===1?'':'s'}`:`${m.sections.length} lesson${m.sections.length===1?'':'s'} · self-paced`}</small></span></div>):<p>Select the features included in your offer.</p>}</div>
   </section>
   <aside className="fs-purchase-card">{coverUrl?<img className="fs-public-cover" src={coverUrl} alt="Product cover"/>:<div className="fs-public-cover fs-cover-type">{included.some(m=>m.kind==='downloads')?<FileText size={48}/>:<GraduationCap size={48}/>}<span>{snapshot.title||'Your next great product'}</span></div>}
    <div className="fs-purchase-body"><div className="fs-price">${(snapshot.priceCents/100).toFixed(2)} <small>USD · one-time</small></div>{children||<button type="button" disabled className="fs-primary">{preview?'Checkout preview':'Purchases unavailable'}<ArrowUpRight size={17}/></button>}<p className="fs-secure"><ShieldCheck size={16}/>Private access after confirmed payment</p></div>
   </aside>
  </Container><footer className="fs-public-footer">Made with FiveGen · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
 </div>;
}
