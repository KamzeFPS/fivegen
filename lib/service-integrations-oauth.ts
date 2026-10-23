import {ApiError,binding,database} from './server';
import {integrationHash,integrationRandom,integrationOrigin,sealIntegration,openIntegration} from './service-integrations-crypto';

export type ServiceProvider='google'|'zoom';
type ServiceTokens={accessToken:string;refreshToken:string};
export const serviceProvider=(value:string):ServiceProvider=>{if(value!=='google'&&value!=='zoom')throw new ApiError('Unknown service provider.',404);return value;};
const scopes={google:['https://www.googleapis.com/auth/calendar.events.owned','https://www.googleapis.com/auth/calendar.events.freebusy'],zoom:['meeting:write:meeting','meeting:read:meeting','meeting:read:list_meetings','meeting:update:meeting','meeting:delete:meeting']};
const tokenScope=(owner:string,provider:ServiceProvider)=>`service-token:v1:${owner}:${provider}`;
function client(provider:ServiceProvider){const id=provider==='google'?binding('GOOGLE_SERVICE_CLIENT_ID')||binding('GOOGLE_CLIENT_ID'):binding('ZOOM_CLIENT_ID'),secret=provider==='google'?binding('GOOGLE_SERVICE_CLIENT_SECRET')||binding('GOOGLE_CLIENT_SECRET'):binding('ZOOM_CLIENT_SECRET');if(!id||!secret||binding('CREDENTIAL_ENCRYPTION_KEY').length<32)throw new ApiError('This provider needs administrator setup before it can be connected.',503);return {id,secret};}
export async function serviceIntegrationStatus(owner:string){
 const rows=(await database().prepare('SELECT provider,status,error,updated_at FROM service_connections WHERE owner=?').bind(owner).all()).results;
 return {providers:(['google','zoom'] as const).map(provider=>{let configured=true;try{client(provider);integrationOrigin();}catch{configured=false;}const row=rows.find(row=>row.provider===provider);return {provider,configured,connected:row?.status==='connected',status:String(row?.status||'disconnected'),error:String(row?.error||''),updatedAt:Number(row?.updated_at||0)};}),testModeSync:false};
}
const cookieName=(provider:ServiceProvider)=>'fivegen_service_oauth_'+provider;
const cookiePath=(provider:ServiceProvider)=>`/api/service-integrations/${provider}/callback`;
const cookie=(provider:ServiceProvider,value:string,maxAge=600)=>`${cookieName(provider)}=${value}; Path=${cookiePath(provider)}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${integrationOrigin().startsWith('https:')?'; Secure':''}`;
export async function startServiceAuthorization(owner:string,provider:ServiceProvider,returnTo='/'){
 const {id}=client(provider),origin=integrationOrigin(),state=integrationRandom(),browser=integrationRandom(),verifier=integrationRandom(),redirect=origin+cookiePath(provider),target=new URL(returnTo,origin);if(target.origin!==origin||!returnTo.startsWith('/')||returnTo.startsWith('//'))throw new ApiError('Invalid return location.');
 await database().prepare('DELETE FROM service_oauth_states WHERE expires_at<? OR (owner=? AND provider=?)').bind(Date.now(),owner,provider).run();
 await database().prepare('INSERT INTO service_oauth_states(state_hash,owner,provider,browser_hash,verifier,return_to,expires_at) VALUES(?,?,?,?,?,?,?)').bind(await integrationHash(state),owner,provider,await integrationHash(browser),await sealIntegration(verifier,`service-pkce:${owner}:${provider}`),target.pathname+target.search,Date.now()+600000).run();
 const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const url=new URL(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://zoom.us/oauth/authorize');url.search=new URLSearchParams({client_id:id,response_type:'code',redirect_uri:redirect,state,scope:scopes[provider].join(' '),code_challenge:challenge,code_challenge_method:'S256',...(provider==='google'?{access_type:'offline',prompt:'consent'}:{})}).toString();
 return {url:url.href,cookie:cookie(provider,browser)};
}
async function exchange(provider:ServiceProvider,params:Record<string,string>){
 const config=client(provider),body=new URLSearchParams({...params,...(provider==='google'?{client_id:config.id,client_secret:config.secret}:{})}),headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};if(provider==='zoom')headers.Authorization='Basic '+btoa(config.id+':'+config.secret);
 let response:Response;try{response=await fetch(provider==='google'?'https://oauth2.googleapis.com/token':'https://zoom.us/oauth/token',{method:'POST',headers,body,signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new ApiError('The provider could not complete authorization. Try again shortly.',502);}
 const data=await response.json() as Record<string,unknown>;if(!response.ok||typeof data.access_token!=='string'||!Number.isFinite(Number(data.expires_in)))throw new ApiError('Authorization expired or was rejected. Reconnect this provider.',409);
 if(data.scope&&typeof data.scope==='string'&&scopes[provider].some(scope=>!String(data.scope).split(' ').includes(scope)))throw new ApiError('Approve the required calendar or meeting permissions to connect.',409);
 return {accessToken:String(data.access_token),refreshToken:typeof data.refresh_token==='string'?data.refresh_token:'',expiresAt:Date.now()+Math.max(60,Math.min(86400,Number(data.expires_in)))*1000};
}
export async function completeServiceAuthorization(req:Request,owner:string,provider:ServiceProvider){
 const url=new URL(req.url),state=url.searchParams.get('state')||'',browser=(req.headers.get('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName(provider)+'='))?.slice(cookieName(provider).length+1)||'';
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(state)||!browser)throw new ApiError('The authorization request is invalid or expired.',403);
 const row=await database().prepare('DELETE FROM service_oauth_states WHERE state_hash=? AND owner=? AND provider=? AND browser_hash=? AND expires_at>? RETURNING *').bind(await integrationHash(state),owner,provider,await integrationHash(browser),Date.now()).first();if(!row)throw new ApiError('The authorization request is invalid or expired.',403);
 if(url.searchParams.has('error'))return {location:integrationOrigin()+String(row.return_to),cookie:cookie(provider,'',0)};
 const code=url.searchParams.get('code');if(!code||code.length>4096)throw new ApiError('The provider did not return an authorization code.');
 const verifier=await openIntegration<string>(String(row.verifier),`service-pkce:${owner}:${provider}`),tokens=await exchange(provider,{grant_type:'authorization_code',code,redirect_uri:integrationOrigin()+cookiePath(provider),code_verifier:verifier});
 if(!tokens.refreshToken)throw new ApiError('Offline access was not granted. Reconnect and approve access so future bookings can sync.',409);
 await database().prepare("INSERT INTO service_connections(owner,provider,credentials,expires_at,status,updated_at) VALUES(?,?,?,?,'connected',?) ON CONFLICT(owner,provider) DO UPDATE SET credentials=excluded.credentials,expires_at=excluded.expires_at,status='connected',refresh_lease=0,error='',updated_at=excluded.updated_at").bind(owner,provider,await sealIntegration({accessToken:tokens.accessToken,refreshToken:tokens.refreshToken},tokenScope(owner,provider)),tokens.expiresAt,Date.now()).run();
 return {location:integrationOrigin()+String(row.return_to),cookie:cookie(provider,'',0)};
}
export async function serviceAccessToken(owner:string,provider:ServiceProvider){
 const row=await database().prepare("SELECT * FROM service_connections WHERE owner=? AND provider=? AND status='connected'").bind(owner,provider).first();if(!row)throw new ApiError('Connect your '+(provider==='google'?'Google Calendar':'Zoom')+' account before using this service.',409);
 const tokens=await openIntegration<ServiceTokens>(String(row.credentials),tokenScope(owner,provider));if(Number(row.expires_at)>Date.now()+60000)return tokens.accessToken;
 const lease=Date.now()+30000,claim=await database().prepare("UPDATE service_connections SET refresh_lease=? WHERE owner=? AND provider=? AND status='connected' AND refresh_lease<? AND credentials=?").bind(lease,owner,provider,Date.now(),row.credentials).run();if(!claim.meta.changes)throw new ApiError('The provider connection is refreshing. Try again shortly.',503);
 try{const fresh=await exchange(provider,{grant_type:'refresh_token',refresh_token:tokens.refreshToken}),sealed=await sealIntegration({accessToken:fresh.accessToken,refreshToken:fresh.refreshToken||tokens.refreshToken},tokenScope(owner,provider)),updated=await database().prepare("UPDATE service_connections SET credentials=?,expires_at=?,refresh_lease=0,error='',updated_at=? WHERE owner=? AND provider=? AND refresh_lease=? AND status='connected'").bind(sealed,fresh.expiresAt,Date.now(),owner,provider,lease).run();if(!updated.meta.changes)throw new ApiError('The connection was disconnected. Reconnect before syncing.',409);return fresh.accessToken;}catch(error){await database().prepare("UPDATE service_connections SET refresh_lease=0,status=CASE WHEN ? THEN 'reconnect' ELSE status END,error=? WHERE owner=? AND provider=? AND refresh_lease=?").bind(error instanceof ApiError&&error.status===409?1:0,error instanceof ApiError?error.message:'Connection refresh failed.',owner,provider,lease).run();throw error;}
}
export async function disconnectServiceIntegration(owner:string,provider:ServiceProvider){
 const row=await database().prepare('DELETE FROM service_connections WHERE owner=? AND provider=? RETURNING credentials').bind(owner,provider).first();await database().prepare("UPDATE service_sync_jobs SET status='reconnect',lease=0,error='The provider was disconnected.' WHERE owner=? AND provider=? AND status!='synced'").bind(owner,provider).run();
 if(row){try{const tokens=await openIntegration<ServiceTokens>(String(row.credentials),tokenScope(owner,provider)),config=client(provider);await fetch(provider==='google'?'https://oauth2.googleapis.com/revoke':'https://zoom.us/oauth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(provider==='zoom'?{Authorization:'Basic '+btoa(config.id+':'+config.secret)}:{})},body:new URLSearchParams({token:tokens.refreshToken}),signal:AbortSignal.timeout(10000),redirect:'error'});}catch{/* Local access is revoked even when the provider is unavailable. */}}
 return serviceIntegrationStatus(owner);
}
