import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),settings={N:32768,r:8,p:3,maxmem:64*1024*1024};
const dummy=`scrypt$32768$8$3$${Buffer.alloc(32).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
let active=0;const waiting=[];
async function bounded(work){
  if(active>=2){if(waiting.length>=8)throw Object.assign(new Error('Sign-in is busy. Wait a moment and try again.'),{status:429});await new Promise(resolve=>waiting.push(resolve));}else active++;
  try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}
}
export async function hashPassword(password){
  return bounded(async()=>{const salt=randomBytes(32),key=await derive(password,salt,64,settings);return `scrypt$32768$8$3$${salt.toString('base64url')}$${key.toString('base64url')}`;});
}
export async function verifyPassword(password,encoded){
  const valid=typeof encoded==='string'&&/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{43}\$[A-Za-z0-9_-]{86}$/.test(encoded),parts=(valid?encoded:dummy).split('$');
  const matches=await bounded(async()=>timingSafeEqual(await derive(password,Buffer.from(parts[4],'base64url'),64,settings),Buffer.from(parts[5],'base64url')));
  return valid&&matches;
}
