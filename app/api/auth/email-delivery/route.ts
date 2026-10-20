import {z} from 'zod';
import {binding} from '@/lib/server';
import {sendTransactionalEmail,transactionalEmailConfiguration} from '@/lib/messaging';

const noStore={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const schema=z.object({to:z.string().email().max(254),name:z.string().max(200),kind:z.enum(['verify','reset','changed']),token:z.string().regex(/^[a-zA-Z0-9_-]{43}$/).optional(),id:z.string().regex(/^[a-zA-Z0-9_-]{43}$/)}).strict();
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export async function POST(request:Request){
  const secret=binding('AUTH_EMAIL_DISPATCH_SECRET');if(secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized.'},{status:401,headers:noStore});
  try{
    const raw=await request.text();if(raw.length>4096)return Response.json({sent:false},{status:413,headers:noStore});const data=schema.parse(JSON.parse(raw)),origin=new URL(binding('APP_ORIGIN'));
    if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('Invalid origin');
    if(data.kind!=='changed'&&!data.token)throw new Error('Missing token');
    const settings=await transactionalEmailConfiguration();if(!settings.ready)return Response.json({sent:false},{status:503,headers:noStore});
    const verify=data.kind==='verify',changed=data.kind==='changed',title=changed?'Your FiveGen password was changed':verify?'Verify your FiveGen email':'Reset your FiveGen password',url=origin.origin+(changed?'/forgot-password':verify?'/verify-email?token='+encodeURIComponent(data.token!):'/reset-password?token='+encodeURIComponent(data.token!));
    const description=changed?'Your password was changed and your previous browser sessions and connected-assistant credentials were signed out. If you did not make this change, reset your password again now.':verify?'Confirm your email using the password you chose when signing up. This link expires in 24 hours. If you did not create this account, ignore this message.':'Choose a new password using this private link. It expires in 30 minutes and can be used once. If you did not request a reset, ignore this message.';
    const text=`${title}\n\n${description}\n\n${url}\n\nFiveGen will never ask you to email your password.`,html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f3f0;color:#20201e;padding:32px 16px"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e9e5de;border-radius:16px;padding:32px"><strong style="font-size:24px">Five<span style="color:#fa7424">Gen</span></strong><h1 style="font-size:26px;line-height:1.25;margin-top:30px">${escape(title)}</h1><p style="line-height:1.8;color:#67645e">${escape(description)}</p><a href="${escape(url)}" style="display:inline-block;padding:15px 22px;background:#fc792a;border-radius:8px;color:#17100b;text-decoration:none;font-weight:bold;margin:14px 0">${changed?'Secure my account':verify?'Verify email':'Reset password'}</a><p style="font-size:12px;line-height:1.7;color:#767169">If the button does not open, paste this private link into your browser:<br>${escape(url)}</p><p style="font-size:12px;color:#767169">FiveGen will never ask you to email your password.</p></div></body></html>`;
    const result=await sendTransactionalEmail({from:`FiveGen <${settings.from}>`,to:[data.to],subject:title,text,html},`fivegen-auth/${data.kind}/${data.id}`);
    return Response.json({sent:result.sent},{status:result.sent?200:503,headers:noStore});
  }catch{return Response.json({sent:false},{status:503,headers:noStore});}
}
