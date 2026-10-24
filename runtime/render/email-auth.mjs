import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {hashPassword,verifyPassword} from './passwords.mjs';

const actions=new Set(['signup','signin','verify-email','resend-verification','forgot-password','reset-password']);
const digest=value=>createHash('sha256').update(value).digest('base64url');
const generic='If this email can use password sign-in, check your inbox for the next step. If you previously used Google, continue with Google to keep your existing workspace.';
const fail=(message,status=400,code)=>Object.assign(new Error(message),{status,code});
const emailValue=value=>typeof value==='string'&&value.length<=254&&/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(value.trim())?value.trim().toLowerCase():null;
const validPassword=value=>typeof value==='string'&&value.length>=15&&value.length<=128;
const validToken=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(value);
async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('Use a JSON request.',415);
  if(Number(req.headers['content-length']||0)>8192)throw fail('Request is too large.',413);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw fail('Request is too large.',413);chunks.push(chunk);}
  try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw fail('Check the submitted details.');}
}
function transaction(db,work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}

export function createEmailAuth(config,storage,{safeReturn,sessionName,makeCookie,sessionSeconds,currentSession,sendEmail=async()=>false,hash=hashPassword,verify=verifyPassword}={}){
  const db=storage.sqlite;let nextCleanup=0,pendingMail=0;
  function accountCurrent(account){return account&&(!String(account.user_id).startsWith('google:')||!!db.prepare('SELECT user_id FROM render_google_identities WHERE user_id=? AND email=?').get(account.user_id,account.email));}
  function cleanup(){const now=Date.now();if(now<nextCleanup)return;db.prepare('DELETE FROM render_email_tokens WHERE COALESCE(used_at,expires)<?').run(now-7*86400000);db.prepare('DELETE FROM render_email_auth_limits WHERE starts_at<?').run(now-2*86400000);nextCleanup=now+3600000;}
  function throttle(action,email,req){
    const now=Date.now(),period=['signup','forgot-password','resend-verification'].includes(action)?3600000:600000;
    // Render's socket peer can be a shared reverse proxy. Account and process
    // limits protect hashing/mail without trusting forwarded IPs or locking a
    // whole customer population behind one low proxy-address limit.
    const rules=[['global',120,60000],[`${action}:${email}`,['signin','verify-email','reset-password'].includes(action)?10:5,period]];
    transaction(db,()=>{for(const [key,max,window] of rules){const row=db.prepare('SELECT * FROM render_email_auth_limits WHERE key=?').get(digest(key));if(row&&row.starts_at+window>now&&row.count>=max)throw fail('Too many attempts. Wait a while before trying again.',429);db.prepare('INSERT INTO render_email_auth_limits(key,count,starts_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN starts_at+?<=? THEN 1 ELSE count+1 END,starts_at=CASE WHEN starts_at+?<=? THEN ? ELSE starts_at END').run(digest(key),now,window,now,window,now,now);}});
  }
  function issue(account,purpose,returnTo){
    const raw=randomBytes(32).toString('base64url'),now=Date.now(),expires=now+(purpose==='verify'?86400000:1800000);
    transaction(db,()=>{db.prepare('UPDATE render_email_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL').run(now,account.user_id,purpose);db.prepare('INSERT INTO render_email_tokens(hash,purpose,user_id,password_hash,return_to,expires,created_at) VALUES(?,?,?,?,?,?,?)').run(digest(raw),purpose,account.user_id,account.password_hash,safeReturn(returnTo),expires,now);});
    return {to:account.email,name:account.name,kind:purpose,token:raw,id:digest(raw)};
  }
  function tokenRow(raw,purpose){const row=validToken(raw)?db.prepare('SELECT t.*,a.email,a.name,a.verified_at,a.password_hash AS current_hash FROM render_email_tokens t JOIN render_email_accounts a ON a.user_id=t.user_id WHERE t.hash=? AND t.purpose=? AND t.used_at IS NULL AND t.expires>? AND t.password_hash=a.password_hash').get(digest(raw),purpose,Date.now()):null;return accountCurrent(row)?row:null;}
  function deliver(payload){
    if(pendingMail>=20){console.warn('Authentication email delivery is busy. Request a new link to retry.');return;}
    pendingMail++;void Promise.resolve().then(()=>sendEmail(payload)).then(sent=>{if(!sent)console.warn('Authentication email delivery is unavailable. Request a new link to retry.');}).catch(()=>{console.warn('Authentication email delivery is unavailable. Request a new link to retry.');}).finally(()=>{pendingMail--;});
  }
  function mail(account,purpose,returnTo){deliver(issue(account,purpose,returnTo));}
  function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',...(status===429?{'Retry-After':'600'}:{})});res.end(JSON.stringify(data));}
  async function handle(req,res,url){
    const action=url.pathname.startsWith('/api/auth/')?url.pathname.slice(10):'';if(!actions.has(action))return false;
    if(req.method!=='POST'){res.setHeader('Allow','POST');respond(res,405,{error:'Use POST to complete this action.'});return true;}
    const startedAt=Date.now();
    try{
      if(req.headers.origin!==config.origin||req.headers['sec-fetch-site']==='cross-site')throw fail('Open FiveGen in this browser before continuing.',403);
      const data=await body(req),email=emailValue(data.email),returnTo=safeReturn(data.returnTo||'/');cleanup();
      if(['signup','signin','forgot-password','resend-verification'].includes(action)&&!email)throw fail('Enter a valid email address.');
      throttle(action,email||digest(String(data.token||'').slice(0,100)),req);
      if(action==='signup'){
        if(!validPassword(data.password))throw fail('Use a password with 15–128 characters.');
        const name=typeof data.name==='string'?data.name.trim().slice(0,200):'';if(!name)throw fail('Enter your name.');
        const passwordHash=await hash(data.password),existing=db.prepare('SELECT * FROM render_email_accounts WHERE email=?').get(email);
        const signedId=req.headers['oai-authenticated-user-id'],signedEmail=req.headers['oai-authenticated-user-email'],knownGoogle=db.prepare('SELECT user_id FROM render_google_identities WHERE email=?').get(email),google=signedId&&signedEmail===email?db.prepare('SELECT user_id FROM render_google_identities WHERE email=? AND user_id=?').get(email,signedId)||knownGoogle:knownGoogle;
        const current=currentSession(req),liveSession=current?db.prepare('SELECT user_id,email FROM render_sessions WHERE hash=? AND expires>?').get(digest(current),Date.now()):null;
        // Merely knowing a federated account's email never reserves its ID or
        // adds a password. Existing Google owners must authenticate explicitly.
        if(google&&(signedId!==google.user_id||signedEmail!==email||liveSession?.user_id!==google.user_id||liveSession?.email!==email)){respond(res,202,{verificationRequired:true,message:generic});return true;}
        let account=existing;
        if(!account){const userId=google?google.user_id:'email:'+randomUUID(),now=Date.now();db.prepare('INSERT OR IGNORE INTO render_email_accounts(email,user_id,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(email,userId,name,passwordHash,now,now);account=db.prepare('SELECT * FROM render_email_accounts WHERE email=?').get(email);}
        if(accountCurrent(account)&&!account.verified_at)mail(account,'verify',returnTo);
        respond(res,202,{verificationRequired:true,message:generic});
      }else if(action==='signin'){
        if(typeof data.password!=='string'||!data.password||data.password.length>128)throw fail('Email or password is incorrect.',401);
        const account=db.prepare('SELECT * FROM render_email_accounts WHERE email=?').get(email),correct=await verify(data.password,account?.password_hash);
        if(!correct||!accountCurrent(account))throw fail('Email or password is incorrect. If you registered with Google, use Continue with Google.',401);
        const session=randomBytes(32).toString('base64url');
        transaction(db,()=>{const fresh=db.prepare('SELECT * FROM render_email_accounts WHERE email=? AND password_hash=?').get(email,account.password_hash);if(!accountCurrent(fresh))throw fail('Your password changed. Sign in again.',401);if(!fresh.verified_at)throw fail('Verify your email before signing in.',403,'EMAIL_UNVERIFIED');const old=currentSession(req);if(old)db.prepare('DELETE FROM render_sessions WHERE hash=?').run(digest(old));db.prepare('INSERT INTO render_sessions(hash,user_id,email,name,expires) VALUES(?,?,?,?,?)').run(digest(session),fresh.user_id,fresh.email,fresh.name,Date.now()+sessionSeconds*1000);});
        res.setHeader('Set-Cookie',makeCookie(sessionName,session,sessionSeconds));respond(res,200,{redirectTo:returnTo});
      }else if(action==='verify-email'){
        if(!validPassword(data.password))throw fail('Enter the 15–128 character password you chose when signing up.');
        const row=tokenRow(data.token,'verify'),correct=await verify(data.password,row?.current_hash);if(!row||!correct)throw fail('This verification link or password is invalid. Request a new link and use your signup password.',400,'INVALID_TOKEN');
        transaction(db,()=>{const fresh=tokenRow(data.token,'verify');if(!fresh||fresh.current_hash!==row.current_hash)throw fail('This verification link has expired or was already used.',400,'INVALID_TOKEN');const now=Date.now();db.prepare('UPDATE render_email_accounts SET verified_at=COALESCE(verified_at,?),updated_at=? WHERE user_id=? AND password_hash=?').run(now,now,row.user_id,row.current_hash);db.prepare('UPDATE render_email_tokens SET used_at=? WHERE user_id=? AND purpose=\'verify\' AND used_at IS NULL').run(now,row.user_id);});
        respond(res,200,{verified:true,returnTo:row.return_to,redirectTo:'/signin?verified=1&return_to='+encodeURIComponent(row.return_to)});
      }else if(action==='forgot-password'||action==='resend-verification'){
        const account=db.prepare('SELECT * FROM render_email_accounts WHERE email=?').get(email);
        if(accountCurrent(account)&&(action==='forgot-password'||!account.verified_at))mail(account,action==='forgot-password'?'reset':'verify',returnTo);
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,250-(Date.now()-startedAt))));
        respond(res,202,{verificationRequired:action==='resend-verification',message:generic});
      }else if(action==='reset-password'){
        if(!validPassword(data.password))throw fail('Use a password with 15–128 characters.');
        const row=tokenRow(data.token,'reset');if(!row)throw fail('This reset link has expired or was already used. Request a new one.',400,'INVALID_TOKEN');
        const passwordHash=await hash(data.password);
        transaction(db,()=>{const fresh=tokenRow(data.token,'reset');if(!fresh||fresh.current_hash!==row.current_hash)throw fail('This reset link has expired or was already used. Request a new one.',400,'INVALID_TOKEN');const now=Date.now();db.prepare('UPDATE render_email_accounts SET password_hash=?,verified_at=COALESCE(verified_at,?),updated_at=? WHERE user_id=? AND password_hash=?').run(passwordHash,now,now,row.user_id,row.current_hash);db.prepare('UPDATE render_email_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now,row.user_id);db.prepare('DELETE FROM render_sessions WHERE user_id=?').run(row.user_id);db.prepare('UPDATE mcp_connections SET revoked=1 WHERE owner=?').run(row.user_id);db.prepare('UPDATE mcp_codes SET used=1 WHERE owner=?').run(row.user_id);});
        deliver({to:row.email,name:row.name,kind:'changed',id:digest(randomBytes(32))});
        res.setHeader('Set-Cookie',makeCookie(sessionName,'',0));respond(res,200,{reset:true,returnTo:row.return_to,redirectTo:'/signin?reset=1&return_to='+encodeURIComponent(row.return_to)});
      }
    }catch(error){const status=Number(error?.status)||500;if(status===500)console.warn('Email authentication could not complete.');respond(res,status,{error:status===500?'Sign-in is temporarily unavailable. Please try again.':error.message,...(['EMAIL_UNVERIFIED','INVALID_TOKEN'].includes(error.code)?{code:error.code}:{})});}
    return true;
  }
  return {handle};
}
