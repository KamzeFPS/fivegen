'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Eye,EyeOff,FileText,Layers,Loader2,LockKeyhole,Mail,ShieldCheck,Sparkles} from 'lucide-react';
import {Brand} from '../ui-brand';
import {authPageLink,authReturnPath,authResultReturnPath,AUTH_PASSWORD_MIN_LENGTH,AUTH_PASSWORD_MAX_LENGTH} from './auth-paths';
import './auth.css';

export type AuthMode='signin'|'signup'|'forgot'|'reset'|'verify';
type AuthResult={error?:string;code?:string;message?:string;redirectTo?:string;verificationRequired?:boolean;verified?:boolean;reset?:boolean};
type Stage='form'|'check-email'|'reset-requested'|'verified'|'password-reset';
function GoogleMark(){return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/></svg>;}

export function AuthScreen({mode,returnTo='/',token='',notice=''}:{mode:AuthMode;returnTo?:string;token?:string;notice?:'verified'|'reset'|''}){
 const destination=authReturnPath(returnTo),[email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [showPassword,setShowPassword]=useState(false),[stage,setStage]=useState<Stage>('form'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[fieldError,setFieldError]=useState(''),[resendMessage,setResendMessage]=useState(''),[completedReturnTo,setCompletedReturnTo]=useState('');
 const mounted=useRef(false),busyRef=useRef(false),abort=useRef<AbortController|null>(null),errorHeading=useRef<HTMLParagraphElement>(null),statusHeading=useRef<HTMLHeadingElement>(null);
 const signup=mode==='signup',signin=mode==='signin',reset=mode==='reset',verify=mode==='verify';
 useEffect(()=>{mounted.current=true;if((reset||verify)&&typeof window!=='undefined'){const url=new URL(window.location.href);if(url.searchParams.has('token')){url.searchParams.delete('token');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}}return()=>{mounted.current=false;abort.current?.abort();};},[reset,verify]);
 useEffect(()=>{if(error)errorHeading.current?.focus({preventScroll:true});},[error]);
 useEffect(()=>{if(stage!=='form')statusHeading.current?.focus({preventScroll:true});},[stage]);
 async function request(action:string,payload:Record<string,string>){
  abort.current=new AbortController();
  const response=await fetch(`/api/auth/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({...payload,returnTo:destination}),signal:abort.current.signal});
  let data:AuthResult;try{data=await response.json();if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid response');}catch{throw new Error('We couldn’t complete that request. Please try again.');}
  return {response,data};
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busyRef.current)return;setError('');setFieldError('');setResendMessage('');
  if(!reset&&!(verify&&token)&&!email.trim()){setFieldError('email');setError('Enter your email address.');return;}
  if((signup||reset||(verify&&token))&&(password.length<AUTH_PASSWORD_MIN_LENGTH||password.length>AUTH_PASSWORD_MAX_LENGTH)){setFieldError('password');setError(`Use a password between ${AUTH_PASSWORD_MIN_LENGTH} and ${AUTH_PASSWORD_MAX_LENGTH} characters.`);return;}
  if(reset&&password!==confirmation){setFieldError('confirmation');setError('Your passwords don’t match. Please check them and try again.');return;}
  if(reset&&!token){setError('This link is missing or has expired. Request a new one below.');return;}
  busyRef.current=true;setBusy(true);
  try{
   const action=signin?'signin':signup?'signup':reset?'reset-password':verify?(token?'verify-email':'resend-verification'):'forgot-password';
   const {response,data}=await request(action,verify&&token?{token,password}:reset?{token,password}:signup?{name:name.trim(),email:email.trim(),password}:signin?{email:email.trim(),password}:{email:email.trim()});
   if(!mounted.current)return;
   if(signin&&data.code==='EMAIL_UNVERIFIED'){setPassword('');setStage('check-email');return;}
   if(!response.ok)throw new Error(data.error||'We couldn’t complete that request. Please try again.');
   setPassword('');setConfirmation('');
   if(signin){window.location.assign(authReturnPath(data.redirectTo||destination));return;}
   if(reset||(verify&&token))setCompletedReturnTo(authResultReturnPath(data.redirectTo,destination));
   setStage(signup?'check-email':reset?'password-reset':verify?(token?'verified':'check-email'):'reset-requested');
  }catch(caught){if(mounted.current&&!(caught instanceof Error&&caught.name==='AbortError'))setError(caught instanceof Error?caught.message:'Something went wrong. Please try again.');}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function resend(){
  if(busyRef.current)return;setError('');setResendMessage('');busyRef.current=true;setBusy(true);
  try{const {response,data}=await request('resend-verification',{email:email.trim()});if(!mounted.current)return;if(!response.ok)throw new Error(data.error||'We couldn’t request another link. Please try again.');setResendMessage('If this address can receive a verification link, it will arrive shortly. Check your inbox and spam folder.');}
  catch(caught){if(mounted.current&&!(caught instanceof Error&&caught.name==='AbortError'))setError(caught instanceof Error?caught.message:'Please try again.');}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 const title=signin?'Welcome back.':signup?'Make room for your next idea.':mode==='forgot'?'Forgot your password?':reset?'Choose a new password.':token?'Verify your email.':'Get a verification link.';
 const description=signin?'Sign in to your workspace or open your purchases.':signup?'Create your FiveGen account. Your next chapter starts here.':mode==='forgot'?'Enter your account email. We’ll help you get back in.':reset?'Choose a strong password you haven’t used elsewhere.':token?'Enter the password you chose when signing up to confirm your email.':'Enter the email address you used when signing up.';
 const pending=stage==='check-email',requested=stage==='reset-requested',verified=stage==='verified',passwordReset=stage==='password-reset';
 const signInLink=authPageLink('/signin',destination),successSignInLink=authPageLink('/signin',completedReturnTo||destination)+(verified?'&verified=1':passwordReset?'&reset=1':''),googleLink='/signin-with-chatgpt?provider=google&return_to='+encodeURIComponent(destination);
 return <main className="auth-page">
  <header className="auth-header"><a href="/" aria-label="FiveGen home"><Brand/></a><a className="auth-home" href="/"><ArrowLeft size={15}/> Back to FiveGen</a></header>
  <div className="auth-layout"><section className="auth-form-pane" aria-label={signin?'Sign in':signup?'Create account':'Account recovery'}>
   <div className="auth-card">
    {stage==='form'?<>
     {(mode==='forgot'||reset)&&<a className="auth-back" href={signInLink}><ArrowLeft size={15}/> Back to sign in</a>}
     <div className="auth-heading">{(verify||reset||mode==='forgot')&&<span className="auth-state-icon">{verify?<ShieldCheck size={24}/>:reset?<LockKeyhole size={24}/>:<Mail size={24}/>}</span>}<h1>{title}</h1><p>{description}</p></div>
     {signin&&notice&&<div className="auth-success" role="status"><CheckCircle2 size={19}/><p>{notice==='verified'?'Your email is verified. Sign in to continue.':'Your password has been updated. Sign in with your new password.'}</p></div>}
     {(signin||signup)&&<><a className={`auth-google ${busy?'is-busy':''}`} aria-disabled={busy||undefined} tabIndex={busy?-1:undefined} href={googleLink} onClick={event=>{if(busy)event.preventDefault();}}><GoogleMark/>Continue with Google</a><div className="auth-divider"><span>or continue with email</span></div></>}
     {reset&&!token?<div><div className="auth-link-note" role="alert"><LockKeyhole size={19}/><p>This reset link is missing. Request a new link to continue.</p></div><a className="auth-submit" style={{marginTop:20}} href={authPageLink('/forgot-password',destination)}>Request a new password reset link <ArrowRight size={17}/></a></div>:<form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}>
       {signup&&<label className="auth-field" htmlFor="auth-name">Your name<input id="auth-name" type="text" autoComplete="name" required minLength={1} maxLength={100} value={name} placeholder="Your name" onChange={event=>setName(event.target.value)}/></label>}
       {!reset&&!(verify&&token)&&<label className="auth-field" htmlFor="auth-email">Email address<input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} placeholder="you@example.com" aria-invalid={fieldError==='email'||undefined} aria-describedby={fieldError==='email'?'auth-error':undefined} onChange={event=>setEmail(event.target.value)}/></label>}
       {(signin||signup||reset||(verify&&token))&&<div className="auth-field"><div className="auth-label-row"><label htmlFor="auth-password">{reset?'New password':verify?'Your signup password':'Password'}</label>{signin&&<a href={authPageLink('/forgot-password',destination)}>Forgot password?</a>}</div><div className="auth-password"><input id="auth-password" type={showPassword?'text':'password'} autoComplete={signin||verify?'current-password':'new-password'} required minLength={signin?undefined:AUTH_PASSWORD_MIN_LENGTH} maxLength={AUTH_PASSWORD_MAX_LENGTH} value={password} placeholder={signin||verify?'Enter your password':`At least ${AUTH_PASSWORD_MIN_LENGTH} characters`} aria-invalid={fieldError==='password'||undefined} aria-describedby={[(signup||reset)?'auth-password-hint':'',fieldError==='password'?'auth-error':''].filter(Boolean).join(' ')||undefined} onChange={event=>setPassword(event.target.value)}/><button type="button" className="auth-reveal" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{(signup||reset)&&<small id="auth-password-hint">{AUTH_PASSWORD_MIN_LENGTH}–{AUTH_PASSWORD_MAX_LENGTH} characters. A few memorable words work well.</small>}</div>}
       {reset&&<label className="auth-field" htmlFor="auth-confirmation">Confirm new password<input id="auth-confirmation" type={showPassword?'text':'password'} autoComplete="new-password" required minLength={AUTH_PASSWORD_MIN_LENGTH} maxLength={AUTH_PASSWORD_MAX_LENGTH} value={confirmation} aria-invalid={fieldError==='confirmation'||undefined} aria-describedby={fieldError==='confirmation'?'auth-error':undefined} onChange={event=>setConfirmation(event.target.value)}/></label>}
       {verify&&token&&<div className="auth-link-note"><ShieldCheck size={19}/><p>Only verify an account you created. If you didn’t request this email, you can close this page.</p></div>}
       {error&&<p id="auth-error" className="auth-error" ref={errorHeading} tabIndex={-1} role="alert">{error}</p>}
       <button className="auth-submit" type="submit" disabled={busy||(reset&&!token)}>{busy?<Loader2 size={17} className="auth-spin"/>:verify?<ShieldCheck size={17}/>:null}{busy?'Please wait…':signin?'Sign in':signup?'Create account':reset?'Save new password':verify?(token?'Verify email':'Send verification link'):'Send reset link'}{!busy&&<ArrowRight size={17}/>}</button>
      </fieldset>
     </form>}
     {verify&&<p className="auth-switch">{token?'Need another link?':'Already verified?'} <a href={token?authPageLink('/verify-email',destination):signInLink}>{token?'Request a new verification email':'Sign in'}</a></p>}
     {verify&&token&&<p className="auth-google-help">Don’t know your signup password? <a href={authPageLink('/forgot-password',destination)}>Reset it.</a></p>}
     {mode==='forgot'&&<p className="auth-google-help">Signed up with Google? <a href={googleLink}>Continue with Google.</a></p>}
     {(signin||signup)&&<p className="auth-switch">{signin?'New to FiveGen?':'Already have an account?'} <a href={authPageLink(signin?'/signup':'/signin',destination)}>{signin?'Create an account':'Sign in'}</a></p>}
     {signup&&<p className="auth-legal-note">You’ll review our terms before entering your workspace. Your email must be verified before you can sign in.</p>}
    </>:<div className="auth-status">
     <span className="auth-state-icon">{pending||requested?<Mail size={26}/>:<CheckCircle2 size={26}/>}</span>
     <h1 ref={statusHeading} tabIndex={-1}>{pending||requested?'Check your email.':verified?'Email verified.':'Password updated.'}</h1>
     <p>{pending?'If this address can receive a verification link, it will arrive shortly. Open the link to verify your email before signing in.':requested?'If this address is eligible, you’ll receive a password reset link. Check your inbox and spam folder.':verified?'You’re ready to sign in with your email and password.':'Sign in with your new password to continue.'}</p>
     {(pending||requested)&&email&&<div className="auth-email-address"><Mail size={16}/><span>{email}</span></div>}
     {pending&&<p className="auth-status-note">Verification keeps your workspace and purchases private. This page has not signed you in.</p>}
     {error&&<p id="auth-error" className="auth-error" ref={errorHeading} tabIndex={-1} role="alert">{error}</p>}
     {resendMessage&&<p className="auth-feedback" role="status">{resendMessage}</p>}
     {pending?<><button type="button" className="auth-submit" disabled={busy||!email.trim()} onClick={()=>void resend()}>{busy?<Loader2 size={17} className="auth-spin"/>:<Mail size={17}/>} {busy?'Requesting link…':'Resend verification email'}</button><a className="auth-status-link" href={signInLink}>Back to sign in <ArrowRight size={15}/></a><button type="button" className="auth-text-button" disabled={busy} onClick={()=>{setStage('form');setResendMessage('');setError('');}}>Use a different email</button></>:<><a className="auth-submit" href={successSignInLink}>Back to sign in <ArrowRight size={17}/></a>{requested&&<button type="button" className="auth-text-button" onClick={()=>{setStage('form');setError('');}}>Try another email address</button>}</>}
     {requested&&<p className="auth-google-help">Signed up with Google? <a href={googleLink}>Continue with Google.</a></p>}
    </div>}
   </div>
  </section><aside className="auth-story" aria-label="Create with FiveGen"><div className="auth-story-copy"><span><Sparkles size={16}/> Your ideas deserve a place.</span><h2>From a spark.<br/>To something<br/><em>worth sharing.</em></h2><p>Books, courses and digital products. Create in your own way, with your own voice.</p></div><div className="auth-preview" aria-hidden="true"><div className="auth-preview-tab"><span className="auth-preview-dot"/> Your next chapter <Layers size={15}/></div><div className="auth-preview-book"><span>Made by you.</span><strong>A fresh<br/>perspective.</strong><FileText size={28}/></div><div className="auth-preview-steps"><span><Check size={14}/> Your ideas</span><span><Check size={14}/> Your content</span><span><Check size={14}/> Your next chapter</span></div></div><div className="auth-story-bottom"><LockKeyhole size={14}/> A private workspace for what comes next.</div></aside></div>
  <footer className="auth-footer"><span>© {new Date().getFullYear()} FiveGen</span><nav aria-label="Legal and support"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="mailto:kamzewac@gmail.com">Get help</a></nav></footer>
 </main>;
}
