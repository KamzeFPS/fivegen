// USD prices checked against provider documentation on 2026-09-11.
export const creditPolicy = {starter:1200, monthly:1000, image:12, video:160} as const;
export const creditPacks = [
  {id:"starter",credits:1000,cents:1500},
  {id:"studio",credits:2500,cents:3500},
  {id:"scale",credits:6000,cents:7500},
] as const;
export const textCredits=(provider:string)=>provider==="anthropic"?30:10;
export const commissionRate=(tier:string)=>tier==="pro"?3:10;
export const commissionAmount=(amount:number,tier:string)=>Math.round(amount*commissionRate(tier)/100);
export function monthlyWindow(start:number,end:number,now=Date.now()){
  const anchor=new Date(start), day=anchor.getUTCDate();
  const at=(offset:number)=>{const d=new Date(start);d.setUTCDate(1);d.setUTCMonth(anchor.getUTCMonth()+offset);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.getTime();};
  let n=Math.max(0,(new Date(now).getUTCFullYear()-anchor.getUTCFullYear())*12+new Date(now).getUTCMonth()-anchor.getUTCMonth());
  if(at(n)>now)n=Math.max(0,n-1);
  return {start:at(n),end:Math.min(end,at(n+1))};
}
export type CreditBalance={starter:number;included:number;purchased:number;total:number;media:number;renewsAt:number|null};
