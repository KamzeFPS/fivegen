import { binding } from "./server";
import { providerKey, providerSettings } from "./ai";
export type TransactionalEmail={from:string;to:string[];subject:string;text:string;html:string};
export type TransactionalEmailResult={sent:boolean;providerId?:string;retryable:boolean;cancelled?:boolean;message:string};
export async function transactionalEmailConfiguration(){
  const settings=await providerSettings(),from=settings.config.emailFrom||binding('EMAIL_FROM');
  const ready=!!settings.connected.resend&&/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(from);
  return {ready,from:ready?from:'',message:ready?'Transactional email is configured.':'Connect Resend and a verified sender email in Platform settings to deliver purchase confirmations.'};
}
// The caller persists this exact payload before delivery. Repeated requests use
// the same provider identity and body, even when a sender or product is edited.
export async function sendTransactionalEmail(payload:TransactionalEmail,id:string,eligible?:()=>Promise<boolean>):Promise<TransactionalEmailResult>{
  try{
    const key=await providerKey('','resend');
    if(eligible&&!await eligible())return {sent:false,retryable:false,cancelled:true,message:'The purchase is no longer eligible for a confirmation.'};
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const result=await response.json().catch(()=>({})) as {id?:string};
    if(response.ok&&typeof result.id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(result.id))return {sent:true,providerId:result.id,retryable:false,message:'Purchase confirmation accepted by the email provider.'};
    const retryable=response.status===409||response.status===429||response.status>=500||response.ok;
    return {sent:false,retryable,message:retryable?'Email delivery could not be confirmed. It will retry safely.':`Email provider rejected delivery (${response.status}). Review Resend and the verified sender.`};
  }catch{return {sent:false,retryable:true,message:'Email delivery could not be confirmed. It will retry with the same email identity.'};}
}
export async function emailReady() {const s=await providerSettings();return !!(s.connected.resend&&(s.config.emailFrom||binding("EMAIL_FROM")));}
export async function sendEmail(to:string,subject:string,text:string,id:string):Promise<{sent:boolean;message:string}> {
  const s=await providerSettings(),from=s.config.emailFrom||binding("EMAIL_FROM");
  if(!s.connected.resend||!from)return {sent:false,message:"Email is not connected yet. Copy and share the invitation link."};
  try {
    const key=await providerKey("", "resend");
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({from,to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)return {sent:false,message:"The email could not be sent. Your invitation is saved; copy its link or retry."};
    return {sent:true,message:"Invitation email sent."};
  }catch{return {sent:false,message:"Email delivery is unavailable. Your saved invitation link still works."};}
}
