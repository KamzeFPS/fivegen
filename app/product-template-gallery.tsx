/* eslint-disable @next/next/no-img-element -- Template previews use explicitly selected images. */
import './product-template-gallery.css';
type Preview={name?:unknown;description?:unknown;useCase?:unknown;software?:unknown;imageUrl?:unknown};
const text=(value:unknown,limit:number)=>typeof value==='string'?value.slice(0,limit):'';
export function templatePreviewImage(value:unknown,slug?:string){
 if(typeof value!=='string')return '';
 const id=/^(?:\/api\/uploads\/|upload:)([a-f0-9-]{36})$/i.exec(value)?.[1];
 if(id)return slug?`/api/builder-preview/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`:`/api/uploads/${id}`;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&/\.(png|jpe?g|webp)$/i.test(url.pathname)&&!url.search?url.href:'';}catch{return '';}
}
/** Only public presentation fields are read here. Download IDs, duplicate
 * links and license files never become gallery props or links. */
export function ProductTemplateGallery({items,publicSlug}:{items:unknown;publicSlug?:string}){
 const previews=(Array.isArray(items)?items:[]).slice(0,100).filter((item):item is Preview=>!!item&&typeof item==='object'&&!!text(item.name,200));if(!previews.length)return null;
 return <section className="template-preview-gallery" aria-label="Template preview gallery"><div className="template-preview-heading"><span className="eyebrow">A CLOSER LOOK</span><h2>Find your next useful template.</h2><p>Explore what is included before making it your own.</p></div><div className="template-preview-grid">{previews.map((item,index)=>{const image=templatePreviewImage(item.imageUrl,publicSlug),name=text(item.name,200);return <article className="template-preview-card" key={index}>{image?<figure><img src={image} alt={name+' preview'} loading="lazy" referrerPolicy="no-referrer"/></figure>:<div className="template-preview-placeholder" aria-hidden="true"><span>{String(index+1).padStart(2,'0')}</span></div>}<div><h3>{name}</h3>{text(item.description,3000)&&<p>{text(item.description,3000)}</p>}{text(item.useCase,1000)&&<p><strong>Made for</strong> {text(item.useCase,1000)}</p>}{text(item.software,300)&&<span className="template-preview-software">{text(item.software,300)}</span>}</div></article>;})}</div></section>;
}
