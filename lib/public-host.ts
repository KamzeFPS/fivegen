import {headers} from 'next/headers';
import {binding} from './server';

/** Render strips these headers from every incoming request and sets them only
 * after a verified creator-host route resolves. Mutations stay on the app. */
export async function publicHostAppOrigin():Promise<string|undefined>{
 const requestHeaders=await headers();if(requestHeaders.get('x-fivegen-public-host')!=='1')return undefined;
 const value=requestHeaders.get('x-fivegen-app-origin');if(!value)return undefined;
 try{const origin=new URL(value),expected=new URL(binding('APP_ORIGIN')||'https://www.fivegen.ai');if(origin.origin!==expected.origin||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))return undefined;return origin.origin;}catch{return undefined;}
}
