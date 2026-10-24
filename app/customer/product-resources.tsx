/* eslint-disable @next/next/no-img-element -- Purchase images require authenticated resource URLs. */
import {ArrowDownToLine,ArrowUpRight,CalendarDays,FileText,Layers,Package,Play,ShieldCheck} from 'lucide-react';
import type {ProductStudioConfig} from '@/lib/product-studio-contract';
import {renderStudioMarkdown} from '@/lib/product-studio-markdown';
import './product-resources.css';

type ResourceContent={id:string;builderType?:string;deliveryFamily?:string;studio?:ProductStudioConfig;downloads?:{id:string;name:string;mime:string;size:number}[];files?:{name:string;description?:string}[];meetingUrl?:string};
type Row=Record<string,unknown>;
const text=(value:unknown)=>typeof value==='string'?value:'';
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((item):item is Row=>!!item&&typeof item==='object'&&!Array.isArray(item)).slice(0,40):[];
const object=(value:unknown):Row=>!!value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const uuid=/^[a-f0-9]{8}-[a-f0-9-]{27}$/i;
function https(value:unknown){if(typeof value!=='string')return '';try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function uploadId(value:unknown){const input=text(value);if(uuid.test(input))return input;return /^\/api\/uploads\/([a-f0-9-]{36})(?:\?.*)?$/i.exec(input)?.[1]||'';}
function embedded(value:unknown){
  const source=https(value);if(!source)return '';const url=new URL(source),host=url.hostname.toLowerCase();
  if(['www.youtube.com','youtube.com','m.youtube.com'].includes(host)){const id=url.searchParams.get('v')||/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]+)/.exec(url.pathname)?.[1];return id&&/^[a-zA-Z0-9_-]{6,30}$/.test(id)?`https://www.youtube-nocookie.com/embed/${id}`:'';}
  if(host==='youtu.be'&&/^\/[a-zA-Z0-9_-]{6,30}$/.test(url.pathname))return 'https://www.youtube-nocookie.com/embed'+url.pathname;
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){const id=/\/(?:video\/)?(\d+)/.exec(url.pathname)?.[1];return id?`https://player.vimeo.com/video/${id}`:'';}
  if(['loom.com','www.loom.com'].includes(host)){const id=/\/(?:share|embed)\/([a-zA-Z0-9]+)/.exec(url.pathname)?.[1];return id?`https://www.loom.com/embed/${id}`:'';}
  return '';
}
function Embed({url,title}:{url:string;title:string}){const src=embedded(url);return src?<iframe className="buyer-resource-embed" src={src} title={title} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowFullScreen/>:<a className="buyer-button secondary" href={url} target="_blank" rel="noopener noreferrer">{title}<ArrowUpRight size={16}/></a>;}

/** All metadata comes from the verified purchase snapshot supplied by the
 * customer API. A file button is only created for that purchase's downloads. */
export function PurchasedProductResources({content}:{content:ResourceContent}){
  const isTemplates=content.builderType==='template-kit'||content.deliveryFamily==='templates',isCustom=content.builderType==='custom';
  if(!isTemplates&&!isCustom)return null;
  const downloads=new Map((content.downloads||[]).map(file=>[file.id,file]));
  const download=(id:string)=>downloads.has(id)?`/api/commerce/customer/${content.id}/uploads/${id}`:'';
  const image=(source:unknown)=>{const id=uploadId(source);return id?(downloads.get(id)?.mime.startsWith('image/')?download(id)+'?inline=1':''):https(source);};
  const imageMap=Object.fromEntries([...downloads].filter(([,file])=>file.mime.startsWith('image/')).flatMap(([id])=>[[id,download(id)+'?inline=1'],[`/api/uploads/${id}`,download(id)+'?inline=1'],[`upload:${id}`,download(id)+'?inline=1']]));
  const rich=(body:string)=><div className="studio-rich-content buyer-resource-copy" dangerouslySetInnerHTML={{__html:renderStudioMarkdown(body,imageMap)}}/>;
  if(isTemplates){
    const config=object(content.studio?.templates),items=rows(config.items),walkthrough=https(config.walkthroughUrl),license=text(config.licenseTerms),version=text(config.version),notes=text(config.releaseNotes);
    if(!items.length&&!walkthrough&&!license&&!version&&!notes)return null;
    return <section className="buyer-template-toolkit" id="customer-template-kit" aria-labelledby="customer-template-kit-heading">
      <header className="buyer-section-heading"><div><h3 id="customer-template-kit-heading">Your toolkit</h3><p>Choose a template, make a copy, and follow the included example.</p></div>{version&&<span className="buyer-template-version">Version {version}</span>}</header>
      {walkthrough&&<details className="buyer-resource-disclosure"><summary><Play size={17}/>Watch the walkthrough</summary><div><Embed url={walkthrough} title="Template walkthrough"/></div></details>}
      {!!items.length&&<div className="buyer-template-gallery">{items.map((item,index)=>{const name=text(item.name)||`Template ${index+1}`,preview=image(item.imageUrl),duplicate=https(item.duplicateUrl),blank=download(text(item.blankUploadId)),example=download(text(item.exampleUploadId));return <article className="buyer-template-card" key={text(item.id)||index}>
        {preview?<img className="buyer-template-preview" src={preview} alt={`${name} preview`} loading="lazy" referrerPolicy="no-referrer"/>:<div className="buyer-template-preview without-image" aria-hidden="true"><Layers size={34}/></div>}
        <div className="buyer-template-card-body"><h4>{name}</h4>{text(item.description)&&<p>{text(item.description)}</p>}{(text(item.useCase)||text(item.software))&&<dl>{text(item.useCase)&&<div><dt>Use it for</dt><dd>{text(item.useCase)}</dd></div>}{text(item.software)&&<div><dt>Works with</dt><dd>{text(item.software)}</dd></div>}</dl>}
          <div className="buyer-template-actions">{duplicate&&<a className="buyer-button primary" href={duplicate} target="_blank" rel="noopener noreferrer">Use this template<ArrowUpRight size={16}/></a>}{blank&&<a className="buyer-button secondary" href={blank}><ArrowDownToLine size={16}/>Blank template</a>}{example&&<a className="buyer-button secondary" href={example}><FileText size={16}/>Filled-in example</a>}</div>
        </div>
      </article>;})}</div>}
      {(license||text(config.license))&&<details className="buyer-resource-disclosure"><summary><ShieldCheck size={17}/>{config.license==='commercial'?'Commercial-use license':'License & usage'}</summary><div>{license?rich(license):<p>{config.license==='commercial'?'Commercial use is included. Follow the creator’s instructions and any terms included in your files.':'For your personal use. Follow any license terms included with the files.'}</p>}</div></details>}
      {notes&&<details className="buyer-resource-disclosure"><summary>What changed{version?` in version ${version}`:''}</summary><div>{rich(notes)}</div></details>}
    </section>;
  }
  const config=object(content.studio?.custom),blocks=rows(config.blocks),fields=rows(config.fields),message=text(config.postPurchaseMessage),fulfillment=text(config.fulfillment);
  if(!blocks.length&&!fields.length&&!message&&!fulfillment)return null;
  const kinds=Array.isArray(config.deliveryKinds)?config.deliveryKinds.filter((kind):kind is string=>typeof kind==='string'):[];
  const formatLabels:Record<string,string>={downloads:'Files',lessons:'Lessons',video:'Video',links:'Links',sessions:'Live sessions',physical:'Physical items','physical items':'Physical items'};
  return <section className="buyer-custom-delivery" id="customer-product-components" aria-labelledby="customer-product-components-heading">
    <header className="buyer-section-heading"><div><h3 id="customer-product-components-heading">Everything in your purchase</h3><p>Your resources and delivery instructions, together in one place.</p></div><Package size={23}/></header>
    {!!kinds.length&&<ul className="buyer-delivery-kinds" aria-label="Included formats">{kinds.map((kind,index)=><li key={kind+index}>{formatLabels[kind]||kind}</li>)}</ul>}
    {message&&<div className="buyer-post-purchase-message">{rich(message)}</div>}
    <div className="buyer-custom-blocks">{blocks.map((block,index)=>{const kind=text(block.kind)||'text',heading=text(block.title)||({image:'Image',video:'Video',audio:'Audio',file:'Your download',session:'Your live session',physical:'Your physical item',link:'Your resource',embed:'Your resource'} as Record<string,string>)[kind]||`Resource ${index+1}`,body=text(block.body),source=text(block.url),id=uploadId(source),local=download(id),external=https(source),url=local||external,picture=image(source),media=id&&downloads.has(id)?`/api/commerce/customer/${content.id}/video/${id}`:external;return <article className={`buyer-custom-block kind-${kind}`} key={text(block.id)||index}>
      <h4>{heading}</h4>{body&&rich(body)}
      {kind==='image'&&picture&&<img src={picture} alt={heading} loading="lazy" referrerPolicy="no-referrer"/>}
      {kind==='video'&&media&&(embedded(media)?<Embed url={media} title={heading}/>:<video src={media} controls playsInline preload="metadata"/>)}
      {kind==='audio'&&media&&<audio src={media} controls preload="metadata" aria-label={heading}/>}
      {kind==='file'&&url&&<a className="buyer-button primary" href={url} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}><ArrowDownToLine size={16}/>Download {heading}</a>}
      {kind==='link'&&url&&<a className="buyer-button secondary" href={url} target="_blank" rel="noopener noreferrer">Open {heading}<ArrowUpRight size={16}/></a>}
      {kind==='embed'&&external&&<Embed url={external} title={heading}/>}
      {kind==='session'&&<a className="buyer-button secondary" href="#customer-session"><CalendarDays size={16}/>View session details</a>}
      {kind==='physical'&&<p className="buyer-physical-note"><Package size={17}/>Follow the creator’s delivery instructions for this item.</p>}
    </article>;})}</div>
    {fulfillment&&<section className="buyer-fulfillment"><h4>Delivery instructions</h4>{rich(fulfillment)}</section>}
    {!!fields.length&&<dl className="buyer-custom-fields">{fields.map((field,index)=><div key={text(field.id)||index}><dt>{text(field.label)||'Details'}</dt><dd>{text(field.value)}</dd></div>)}</dl>}
  </section>;
}
