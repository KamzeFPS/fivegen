import {requireAdmin} from '@/lib/admin';
import {ApiError,database,failure,sameOrigin} from '@/lib/server';
import {z} from 'zod';

const emailSchema=z.string().trim().email().max(320);
const grantSchema=z.object({
  email:emailSchema,
  credits:z.number().int().min(1).max(1000),
  requestId:z.string().uuid(),
});

export async function GET(req:Request){
  try{
    sameOrigin(req);
    await requireAdmin();
    const email=emailSchema.parse(new URL(req.url).searchParams.get('email')).toLowerCase(),db=database();
    const target=await db.prepare('SELECT owner FROM terms_acceptances WHERE lower(trim(email))=? ORDER BY accepted_at DESC LIMIT 1').bind(email).first<{owner:string}>();
    if(!target)throw new ApiError('No FiveGen account was found for that email.',404);
    const [wallet,history]=await Promise.all([
      db.prepare('SELECT purchased FROM wallets WHERE owner=?').bind(target.owner).first<{purchased:number}>(),
      db.prepare('SELECT id,credits,applied,created_at FROM credit_admin_grants WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 101').bind(target.owner).all<{id:string;credits:number;applied:number;created_at:number}>(),
    ]);
    return Response.json({email,purchasedBalance:Number(wallet?.purchased||0),grants:history.results.slice(0,100).map(grant=>({...grant,applied:grant.applied===1})),hasMore:history.results.length>100},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}

export async function POST(req:Request){
  try{
    sameOrigin(req);
    const admin=await requireAdmin(),input=grantSchema.parse(await req.json()),email=input.email.toLowerCase();
    const db=database();
    const target=await db.prepare('SELECT owner FROM terms_acceptances WHERE lower(trim(email))=? ORDER BY accepted_at DESC LIMIT 1').bind(email).first<{owner:string}>();
    if(!target)throw new ApiError('No FiveGen account was found for that email.',404);
    const now=Date.now();
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO credit_admin_grants (id,owner,email,credits,admin,applied,created_at) VALUES (?,?,?,?,?,0,?)').bind(input.requestId,target.owner,email,input.credits,admin.userId,now),
      db.prepare('INSERT OR IGNORE INTO wallets (owner,starter) VALUES (?,0)').bind(target.owner),
      db.prepare('UPDATE wallets SET purchased=purchased+(SELECT credits FROM credit_admin_grants WHERE id=? AND applied=0) WHERE owner=? AND EXISTS(SELECT 1 FROM credit_admin_grants WHERE id=? AND applied=0)').bind(input.requestId,target.owner,input.requestId),
      db.prepare('UPDATE credit_admin_grants SET applied=1 WHERE id=? AND applied=0').bind(input.requestId),
    ]);
    const grant=await db.prepare('SELECT owner,email,credits,admin,applied FROM credit_admin_grants WHERE id=?').bind(input.requestId).first<{owner:string;email:string;credits:number;admin:string;applied:number}>();
    if(!grant||grant.owner!==target.owner||grant.email!==email||grant.credits!==input.credits||grant.admin!==admin.userId||grant.applied!==1)throw new ApiError('Grant request ID was already used for a different request.',409);
    const wallet=await db.prepare('SELECT purchased FROM wallets WHERE owner=?').bind(target.owner).first<{purchased:number}>();
    return Response.json({email,creditsGranted:input.credits,purchasedBalance:Number(wallet?.purchased||0)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
