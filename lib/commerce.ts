import { z } from "zod";

export const selectionSchema=z.object({slug:z.string().min(1).max(80),quantity:z.number().int().min(1).max(100).default(1),code:z.string().max(30).default(""),addUpsell:z.boolean().default(false)});

export const dealTypes = ["none", "percentage", "fixed", "bogo", "bundle", "bonus", "volume", "early_bird", "flash_sale"] as const;
export const dealNames: Record<(typeof dealTypes)[number], string> = {
  none: "No deal", percentage: "Percentage off", fixed: "Amount off", bogo: "Buy one, get one", bundle: "Bundle price", bonus: "Free bonus", volume: "Volume discount", early_bird: "Early-bird price", flash_sale: "Limited-time sale",
};
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const optionalDate = z.string().max(35).refine(v => !v || Number.isFinite(Date.parse(v)), "Enter a valid date.");
export const blockSchema = z.object({
  id: z.string().min(1).max(60), kind: z.enum(["hero", "text", "benefits", "image", "video", "testimonial", "faq", "offer"]),
  title: z.string().max(160), body: z.string().max(8000), image: z.string().max(1500).default(""),
  visible: z.boolean().default(true), align: z.enum(["left", "center"]).default("left"),
}).refine(b => !b.image || /^https:\/\//i.test(b.image) || /^\/api\/assets\/[a-zA-Z0-9-]+\/file$/.test(b.image), "Use an HTTPS image URL or a FiveGen asset.");
export const commerceSchema = z.object({
  billing: z.enum(["once", "month", "year"]).default("once"),
  deal: z.object({ type: z.enum(dealTypes).default("none"), value: z.number().min(0).max(9999).default(20), code: z.string().max(30).regex(/^[a-zA-Z0-9_-]*$/).default(""), startsAt: optionalDate.default(""), endsAt: optionalDate.default(""), minimum: z.number().int().min(2).max(100).default(3), productId: z.string().max(60).default("") }).default({}),
  upsell: z.object({ enabled: z.boolean().default(false), productId: z.string().max(60).default(""), price: z.number().min(0).max(9999).default(9), headline: z.string().max(120).default("Complete your toolkit"), description: z.string().max(400).default("") }).default({}),
  funnel: z.object({ enabled: z.boolean().default(false), accent: hex.default("#dbff73"), background: hex.default("#0c0c0e"), foreground: hex.default("#f4f4f7"), font: z.enum(["sans", "serif"]).default("sans"), width: z.enum(["focused", "wide"]).default("focused"), radius: z.enum(["sharp", "soft", "round"]).default("soft"), cta: z.string().min(1).max(50).default("Get instant access"), blocks: z.array(blockSchema).max(20).default([]) }).default({}),
}).superRefine((c, ctx) => {
  const d = c.deal;
  if (["percentage", "volume", "early_bird", "flash_sale"].includes(d.type) && d.value > 100) ctx.addIssue({code:"custom", path:["deal","value"], message:"A percentage must be between 0 and 100."});
  if (["bogo","bonus","bundle"].includes(d.type) && !d.productId) ctx.addIssue({code:"custom", path:["deal","productId"], message:"Choose the included product."});
  if (["early_bird","flash_sale"].includes(d.type) && !d.endsAt) ctx.addIssue({code:"custom", path:["deal","endsAt"], message:"Set an end date for this offer."});
  if (d.startsAt && d.endsAt && Date.parse(d.startsAt)>=Date.parse(d.endsAt)) ctx.addIssue({code:"custom", path:["deal","endsAt"], message:"The end must be after the start."});
  if (c.upsell.enabled && !c.upsell.productId) ctx.addIssue({code:"custom", path:["upsell","productId"], message:"Choose an upsell product."});
  if(c.billing!=="once" && (d.type!=="none" || c.upsell.enabled)) ctx.addIssue({code:"custom", message:"Deals and upsells are for one-time purchases. Turn them off before enabling recurring billing."});
  if(c.funnel.enabled && c.funnel.blocks.filter(b=>b.visible && b.kind==="offer").length!==1) ctx.addIssue({code:"custom",path:["funnel","blocks"],message:"Keep exactly one visible checkout block in your funnel."});
  if(new Set(c.funnel.blocks.map(b=>b.id)).size!==c.funnel.blocks.length)ctx.addIssue({code:"custom",path:["funnel","blocks"],message:"Each section needs a unique identifier."});
});
export type Commerce = z.infer<typeof commerceSchema>;
export type FunnelBlock = z.infer<typeof blockSchema>;
export const defaultCommerce = (): Commerce => commerceSchema.parse({});
export function readCommerce(value: unknown): Commerce {
  try { return commerceSchema.parse(typeof value === "string" ? JSON.parse(value) : value || {}); } catch { return defaultCommerce(); }
}
export function advancedCommerce(c: Commerce) { return c.billing!=="once" || c.deal.type!=="none" || c.upsell.enabled || c.funnel.enabled; }
export function initialBlocks(title: string, description: string, benefits: string[]): FunnelBlock[] {
  return [
    {id:"hero",kind:"hero",title,body:description,image:"",visible:true,align:"center"},
    {id:"benefits",kind:"benefits",title:"What you’ll get",body:benefits.join("\n"),image:"",visible:true,align:"left"},
    {id:"offer",kind:"offer",title:"Ready to get started?",body:"Get your digital product and put it into practice.",image:"",visible:true,align:"center"},
  ];
}
export type OfferProduct = {id:string; slug:string; title:string; price:number};
export function publicOfferProduct(p:OfferProduct):OfferProduct{return {id:p.id,slug:p.slug,title:p.title,price:p.price};}
export type Quote = { total:number; original:number; savings:number; quantity:number; billing:Commerce["billing"]; deal:string|null; items:Array<OfferProduct & {amount:number}>; upsell:OfferProduct & {amount:number;headline:string;description:string}|null; includedTitle:string|null };
export function calculateQuote(product:OfferProduct, commerce:Commerce, related:OfferProduct[], quantity=1, code="", addUpsell=false, now=Date.now()):Quote {
  // Product objects can contain private files and chapters. Never spread them into a public quote.
  product=publicOfferProduct(product);related=related.map(publicOfferProduct);
  if(!Number.isInteger(quantity)||quantity<1||quantity>100) throw new Error("Choose between 1 and 100 licenses.");
  if(commerce.billing!=="once" && quantity!==1) throw new Error("Subscriptions are sold individually.");
  const cents=(v:number)=>Math.round(v*100);
  const d=commerce.deal;
  if(code && (!d.code || code.trim().toUpperCase()!==d.code.toUpperCase())) throw new Error("That promotion code is not valid.");
  const inWindow=(!d.startsAt || now>=Date.parse(d.startsAt)) && (!d.endsAt || now<Date.parse(d.endsAt));
  if(code && !inWindow) throw new Error("This offer is not currently active.");
  const applies=d.type!=="none" && inWindow && (!d.code||code.trim().toUpperCase()===d.code.toUpperCase());
  let original=cents(product.price)*quantity, total=original, deal:string|null=null, includedTitle:string|null=null;
  const items:Array<OfferProduct & {amount:number}>=[{...product,amount:total}];
  if(applies){
    if(["percentage","early_bird","flash_sale"].includes(d.type)||(d.type==="volume"&&quantity>=d.minimum)){total=Math.max(0,Math.round(total*(1-d.value/100)));deal=dealNames[d.type];}
    if(d.type==="fixed"){total=Math.max(0,total-cents(d.value));deal=dealNames[d.type];}
    if(["bogo","bonus","bundle"].includes(d.type)){
      const bonus=related.find(p=>p.id===d.productId); if(!bonus) throw new Error("The included product is unavailable. Please contact the creator.");
      original+=cents(bonus.price)*quantity; if(d.type==="bundle") total=cents(d.value)*quantity;
      items.push({...bonus,amount:0});deal=dealNames[d.type];includedTitle=bonus.title;
    }
  }
  items[0].amount=total;
  const extra=commerce.upsell.enabled?related.find(p=>p.id===commerce.upsell.productId):undefined;
  const upsell=extra?{...extra,amount:cents(commerce.upsell.price),headline:commerce.upsell.headline,description:commerce.upsell.description}:null;
  if(addUpsell){ if(!upsell) throw new Error("This add-on is unavailable."); if(items.some(i=>i.id===upsell.id)) throw new Error("This product is already included in your offer.");total+=upsell.amount;original+=cents(upsell.price);items.push({...upsell}); }
  return {total,original,savings:Math.max(0,original-total),quantity,billing:commerce.billing,deal,items,upsell,includedTitle};
}
