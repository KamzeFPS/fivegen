import { binding } from "./server";
import { providerKey, providerSettings } from "./ai";
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
