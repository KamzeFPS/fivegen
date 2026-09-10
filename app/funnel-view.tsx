import type { CSSProperties, ReactNode } from "react";
import type { Commerce } from "@/lib/commerce";
import { Check, ArrowRight } from "lucide-react";
export function FunnelView({funnel,checkout,preview=false}:{funnel:Commerce["funnel"];checkout:ReactNode;preview?:boolean}){
  const style={"--f-accent":funnel.accent,"--f-bg":funnel.background,"--f-text":funnel.foreground,"--f-radius":funnel.radius==="sharp"?"0px":funnel.radius==="round"?"28px":"14px",background:funnel.background,color:funnel.foreground,fontFamily:funnel.font==="serif"?"Georgia, serif":"inherit"} as CSSProperties;
  return <div className={`funnel-canvas ${funnel.width} ${preview?"is-preview":""}`} style={style}>
    {funnel.blocks.filter(b=>b.visible).map(b=><section key={b.id} className={`funnel-block block-${b.kind} align-${b.align}`}>
      {b.kind==="hero"?<><span className="funnel-eyebrow">A DIGITAL PRODUCT. A REAL POSSIBILITY.</span><h1>{b.title}</h1><p>{b.body}</p>{b.image&&<img src={b.image} alt={b.title} loading="lazy"/>}<a className="funnel-cta" href={preview?"#funnel-preview-checkout":"#funnel-checkout"}>{funnel.cta}<ArrowRight size={17}/></a></>
      :b.kind==="image"?<>{b.image?<img src={b.image} alt={b.title} loading="lazy"/>:preview?<div className="funnel-image-placeholder">Add an image URL</div>:null}{b.title&&<h2>{b.title}</h2>}{b.body&&<p>{b.body}</p>}</>
      :b.kind==="video"?<>{b.title&&<h2>{b.title}</h2>}{b.image?<video controls playsInline preload="metadata" src={b.image}/>:preview?<div className="funnel-image-placeholder">Add an MP4 or WebM video URL</div>:null}{b.body&&<p>{b.body}</p>}</>
      :b.kind==="benefits"?<><h2>{b.title}</h2><ul>{b.body.split("\n").filter(Boolean).map((line,i)=><li key={i}><Check size={19}/>{line}</li>)}</ul></>
      :b.kind==="testimonial"?<figure><blockquote>{b.body}</blockquote><figcaption>{b.title}</figcaption></figure>
      :b.kind==="faq"?<><h2>{b.title}</h2>{b.body.split("\n").filter(Boolean).map((line,i)=>{const [q,...a]=line.split("|");return <details key={i}><summary>{q}</summary><p>{a.join("|")}</p></details>;})}</>
      :b.kind==="offer"?<div id={preview?"funnel-preview-checkout":"funnel-checkout"}><h2>{b.title}</h2><p>{b.body}</p><div className="funnel-checkout-card">{checkout}</div></div>
      :<><h2>{b.title}</h2><p>{b.body}</p></>}
    </section>)}
  </div>;
}
