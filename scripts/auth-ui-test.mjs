import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cva} from 'class-variance-authority';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import {Slot,Label as LabelPrimitive,Separator as SeparatorPrimitive} from 'radix-ui';
import ts from 'typescript';

process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[auth fixture]'));process.exitCode=1;});

// The shipped forms run with deterministic hooks, HTTP replies and a browser
// location stub. No account, provider key, token delivery or real email is used.
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},transformers:{before:[context=>source=>context.factory.updateSourceFile(source,source.statements.filter(node=>!ts.isImportDeclaration(node)))]}}).outputText;
async function loadPrimitive(path,dependencies){const key='authPrimitive'+randomUUID().replaceAll('-','');globalThis[key]=dependencies;try{return await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${compile(path)}`).toString('base64'));}finally{delete globalThis[key];}}
// Run the shipped shadcn wrappers rather than substituting passthroughs. Radix
// internals stay React elements and are rendered by the real server renderer.
const {cn}=await loadPrimitive('lib/utils.ts',{clsx,twMerge}),primitiveBase={React,cn,cva};
const primitiveDependencies={...primitiveBase,...await loadPrimitive('components/ui/input.tsx',primitiveBase),...await loadPrimitive('components/ui/textarea.tsx',primitiveBase),...await loadPrimitive('components/ui/button.tsx',{...primitiveBase,Slot}),...await loadPrimitive('components/ui/label.tsx',{...primitiveBase,LabelPrimitive}),...await loadPrimitive('components/ui/separator.tsx',{...primitiveBase,SeparatorPrimitive})};
Object.assign(primitiveDependencies,await loadPrimitive('components/ui/field.tsx',{...primitiveDependencies,useMemo:React.useMemo}));
Object.assign(primitiveDependencies,await loadPrimitive('components/ui/input-group.tsx',primitiveDependencies));
const primitives=Object.fromEntries(Object.entries(primitiveDependencies).filter(([name])=>/^(?:Input|Textarea|Button|Field|Label|Separator)/.test(name))),purePrimitives=new Set(Object.entries(primitives).filter(([name])=>name!=='FieldError').map(([,component])=>component));
const paths=await import('data:text/javascript;base64,'+Buffer.from(compile('app/auth/auth-paths.ts')).toString('base64'));
const {authReturnPath,authPageLink,AUTH_PASSWORD_MIN_LENGTH,AUTH_PASSWORD_MAX_LENGTH}=paths;
const exactReturn='/customer?order=owned-order-123';
assert.equal(authReturnPath(exactReturn),exactReturn);assert.equal(authReturnPath('/build/a?step=publish#details'),'/build/a?step=publish#details');
const invalidReturns=['https://evil.test','//evil.test','/\\evil.test','/signin','/signin/','/%73ignin','/signup?return_to=/signin','/forgot-password','/verify-email?token=secret','/reset-password','/callback','/api/auth','/api/auth/signin','/api/%61uth/signup','/\u0000bad'];
for(const target of invalidReturns)assert.equal(authReturnPath(target),'/',`Unsafe or looping return rejected: ${JSON.stringify(target)}`);
assert.equal(new URL(authPageLink('/signup',exactReturn),'https://fivegen.test').searchParams.get('return_to'),exactReturn);
assert.equal(AUTH_PASSWORD_MIN_LENGTH,15);assert.equal(AUTH_PASSWORD_MAX_LENGTH,128);
// Exercise the actual server-facing auth links against the same malicious and
// legitimate destinations, rather than checking their implementation source.
const serverHelperKey=`authServerHelpers${randomUUID().replaceAll('-','')}`;globalThis[serverHelperKey]={authReturnPath};
let serverHelpers;try{serverHelpers=await import('data:text/javascript;base64,'+Buffer.from(`const {authReturnPath}=globalThis.${serverHelperKey};\n${compile('app/chatgpt-auth.ts')}`).toString('base64'));}finally{delete globalThis[serverHelperKey];}
for(const target of invalidReturns)assert.equal(serverHelpers.safeRelativeReturnPath(target),'/');
assert.equal(serverHelpers.safeRelativeReturnPath(exactReturn),exactReturn);assert.equal(new URL(serverHelpers.chatGPTSignInPath(exactReturn),'https://fivegen.test').searchParams.get('return_to'),exactReturn);assert.equal(new URL(serverHelpers.chatGPTSignOutPath('/signup'),'https://fivegen.test').searchParams.get('return_to'),'/');
const sameDeps=(before,after)=>before&&after&&before.length===after.length&&before.every((value,index)=>Object.is(value,after[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(purePrimitives.has(value.type)?value.type(value.props):value.props.children)]:[];}
function text(value){return Array.isArray(value)?value.map(text).join(' '):React.isValidElement(value)?text(value.props.children):value==null||typeof value==='boolean'?'':String(value);}
const readable=value=>text(value).replace(/\s+/g,' ').trim(),code=compile('app/auth/auth-screen.tsx');
async function harness(props,href='https://fivegen.test/signin'){
 const hooks=[],effects=[],requests=[],navigations=[],replacements=[],focusCalls=[];let cursor=0,dirty=true,tree;
 const useState=initial=>{const index=cursor++;if(!hooks[index])hooks[index]={value:typeof initial==='function'?initial():initial};return[hooks[index].value,next=>{const value=typeof next==='function'?next(hooks[index].value):next;if(!Object.is(value,hooks[index].value)){hooks[index].value=value;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||={current:initial};};
 const useEffect=(callback,deps)=>{const index=cursor++,old=hooks[index];if(!old||!sameDeps(old.deps,deps)){hooks[index]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[index].cleanup?.();hooks[index].cleanup=callback();});}};
 const window={location:{href,assign(path){navigations.push(path);}},history:{replaceState(_state,_title,path){replacements.push(path);window.location.href=new URL(path,window.location.href).href;}}};
 const iconNames=['ArrowLeft','ArrowRight','Check','CheckCircle2','Eye','EyeOff','FileText','Layers','Loader2','LockKeyhole','Mail','ShieldCheck','Sparkles'];
 const dependencies={React,useState,useRef,useEffect,window,...paths,...primitives,AppearanceControl:()=>null,Brand:()=>React.createElement('span',null,'FiveGen'),...Object.fromEntries(iconNames.map(name=>[name,()=>React.createElement('svg',{'data-test-icon':name,'aria-hidden':true})])),fetch(url,options){const pending=deferred();requests.push({url,options,...pending});return pending.promise;},localStorage:{getItem(){throw new Error('Auth must not use local storage');},setItem(){throw new Error('Auth must not persist secrets');}}};
 const key=`authUi${randomUUID().replaceAll('-','')}`;globalThis[key]=dependencies;let AuthScreen;try{({AuthScreen}=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(dependencies).join(',')}}=globalThis.${key};\n${code}`).toString('base64')));}finally{delete globalThis[key];}
 function render(){for(let turn=0;dirty&&turn<30;turn++){dirty=false;cursor=0;tree=AuthScreen(props);for(const node of nodes(tree))if(node.props.ref)node.props.ref.current={focus:options=>focusCalls.push({text:readable(node),options})};for(const effect of effects.splice(0))effect();}assert.equal(dirty,false,'Auth form effects settle');}
 async function settle(){for(let tick=0;tick<12;tick++){await Promise.resolve();render();}}
 render();return{
  requests,navigations,replacements,focusCalls,get tree(){return tree;},get text(){return readable(tree);},
  find(type){return nodes(tree).filter(node=>node.type===type);},input(id){const input=this.find('input').find(node=>node.props.id===id);assert.ok(input,`Input exists: ${id}`);return input;},
  change(id,value){this.input(id).props.onChange({target:{value}});render();},
  button(label){const node=this.find('button').find(node=>node.props['aria-label']===label||readable(node)===label);assert.ok(node,`Button exists: ${label}`);return node;},
  click(label){const node=this.button(label);assert.ok(!node.props.disabled);const result=node.props.onClick();render();return result;},
  submit(){const form=this.find('form')[0];assert.ok(form);const result=form.props.onSubmit({preventDefault(){}});render();return result;},
  async respond(index,data,status=200){requests[index].resolve(Response.json(data,{status}));await settle();},
  dispose(){for(const hook of hooks)hook?.cleanup?.();},settle,
 };
}
const password='a memorable private phrase';
// The real primitive composition must preserve native form and password-manager
// semantics in every mode, not merely produce similarly styled wrapper nodes.
for(const props of [{mode:'signin'},{mode:'signup'},{mode:'forgot'},{mode:'verify'},{mode:'verify',token:'synthetic-proof-token'},{mode:'reset',token:'synthetic-reset-token'}]){
 const app=await harness(props),markup=renderToStaticMarkup(app.tree),expected=props.mode==='signup'?['auth-name','auth-email','auth-password']:props.mode==='reset'?['auth-password','auth-confirmation']:props.mode==='verify'&&props.token?['auth-password']:props.mode==='signin'?['auth-email','auth-password']:['auth-email'];
 assert.equal(app.find('form').length,1);
 for(const form of app.find('form'))assert.equal(String(form.props.method||'get').toLowerCase(),'post','Native submission must never put named credentials in a GET query before hydration');
 assert.match(markup,/<form\b[^>]*\bmethod="post"/i,'The actual server-rendered form keeps credentials out of URL query strings');
 assert.deepEqual(app.find('input').map(input=>input.props.id),expected);
 assert.equal(app.find('div').filter(node=>node.props['data-slot']==='field-group').length,1,'One actual FieldGroup contains the form controls');
 assert.equal(app.find('div').filter(node=>node.props['data-slot']==='field'&&node.props.role==='group').length,expected.length);
 for(const id of expected){const input=app.input(id);assert.equal(input.props.name,{'auth-name':'name','auth-email':'email','auth-password':'password','auth-confirmation':'password_confirmation'}[id]);assert.equal(input.props.required,true);assert.match(markup,new RegExp('<label\\b[^>]*\\bfor="'+id+'"'),'Real Radix-backed labels target the rendered native input');}
 if(expected.includes('auth-password')){assert.equal(app.button('Show password').props.type,'button','The primitive reveal control cannot submit the form');assert.equal(app.find('div').filter(node=>node.props['data-slot']==='input-group'&&node.props.role==='group').length,1);}
 const skip=app.find('a').find(node=>readable(node)==='Skip to form');assert.equal(skip?.props.href,'#auth-form');assert.equal(app.find('section').find(node=>node.props.id==='auth-form')?.props.tabIndex,-1);
 assert.equal(app.requests.length,0);app.dispose();
}
{
 const app=await harness({mode:'signup'});app.change('auth-name','A careful creator');app.change('auth-email','creator@example.test');app.change('auth-password','short');await app.submit();
 const invalidField=app.find('div').find(node=>node.props['data-slot']==='field'&&node.props['data-invalid']===true);assert.ok(invalidField,'The actual Field exposes its invalid state');assert.equal(nodes(invalidField).filter(node=>node.props.id==='auth-error').length,1,'The message is placed inside its invalid field');assert.equal(app.find('p').filter(node=>node.props.id==='auth-error').length,1,'Only one alert has the described error ID');assert.equal(app.input('auth-password').props['aria-invalid'],true);assert.match(app.input('auth-password').props['aria-describedby'],/auth-password-hint/);assert.match(app.input('auth-password').props['aria-describedby'],/auth-error/);assert.equal(app.focusCalls.at(-1).options.preventScroll,true);assert.equal(app.requests.length,0);
 const hint=()=>app.find('small').find(node=>node.props.id==='auth-password-hint');assert.equal(hint().props['data-ready'],undefined);app.change('auth-password',password);assert.equal(hint().props['data-ready'],true,'The hint reports the real minimum/maximum rule without an invented security rating');app.change('auth-password','x'.repeat(129));assert.equal(hint().props['data-ready'],undefined);app.dispose();
}
{
 const app=await harness({mode:'signin',returnTo:exactReturn});
 assert.match(app.text,/Welcome back/);assert.equal(app.requests.length,0,'Sign-in never submits automatically');
 assert.equal(app.input('auth-password').props.autoComplete,'current-password');assert.equal(app.input('auth-email').props.type,'email');
 const google=app.find('a').find(node=>readable(node).includes('Continue with Google'));const googleURL=new URL(google.props.href,'https://fivegen.test');assert.equal(googleURL.searchParams.get('provider'),'google');assert.equal(googleURL.searchParams.get('return_to'),exactReturn);
 assert.equal(new URL(app.find('a').find(node=>readable(node)==='Forgot password?').props.href,'https://fivegen.test').searchParams.get('return_to'),exactReturn);
 app.change('auth-email',' buyer@example.test ');app.change('auth-password',password);app.click('Show password');assert.equal(app.input('auth-password').props.type,'text');assert.equal(app.button('Hide password').props['aria-pressed'],true);app.click('Hide password');
 const pending=app.submit();app.submit();assert.equal(app.requests.length,1,'Busy ref prevents duplicate submits before the next paint');
 assert.deepEqual(JSON.parse(app.requests[0].options.body),{email:'buyer@example.test',password,returnTo:exactReturn});assert.equal(app.requests[0].url,'/api/auth/signin');assert.equal(app.requests[0].options.credentials,'same-origin');assert.equal(app.requests[0].options.cache,'no-store');assert.equal(app.find('fieldset')[0].props.disabled,true);
 await app.respond(0,{error:'Email or password is incorrect.'},401);await pending;assert.match(app.text,/Email or password is incorrect/);assert.equal(app.navigations.length,0);assert.equal(app.button('Sign in').props.disabled,false);assert.equal(app.focusCalls.at(-1).options.preventScroll,true);
 const next=app.submit();await app.respond(1,{redirectTo:exactReturn});await next;assert.deepEqual(app.navigations,[exactReturn]);app.dispose();
}
{
 const app=await harness({mode:'signin',returnTo:'https://evil.test'});app.change('auth-email','buyer@example.test');app.change('auth-password',password);const pending=app.submit();assert.equal(JSON.parse(app.requests[0].options.body).returnTo,'/');await app.respond(0,{redirectTo:'https://evil.test'});await pending;assert.deepEqual(app.navigations,['/']);app.dispose();
}
for(const mode of ['signup','signin']){
 const app=await harness({mode,returnTo:exactReturn});if(mode==='signup')app.change('auth-name','Taylor Reader');app.change('auth-email','buyer@example.test');app.change('auth-password',password);
 assert.equal(app.find('input').some(input=>input.props.type==='checkbox'),false,'Auth never accepts legal terms on behalf of the user');
 const pending=app.submit();await app.respond(0,mode==='signup'?{verificationRequired:true,message:'Generic response'}:{error:'Verify your email.',code:'EMAIL_UNVERIFIED'},mode==='signup'?202:403);await pending;
 assert.match(app.text,/Check your email/);assert.match(app.text,/This page has not signed you in/);assert.doesNotMatch(app.text,/email has been sent|account exists|already registered/i);assert.equal(app.navigations.length,0);assert.equal(app.find('input').length,0,'Passwords do not stay in the pending verification form');
 const resend=app.click('Resend verification email');assert.equal(app.requests[1].url,'/api/auth/resend-verification');assert.deepEqual(JSON.parse(app.requests[1].options.body),{email:'buyer@example.test',returnTo:exactReturn});await app.respond(1,{verificationRequired:true},202);await resend;assert.match(app.text,/If this address can receive a verification link/);assert.equal(app.requests.some(request=>request.url==='/api/terms'),false);
 app.click('Use a different email');assert.ok(app.input('auth-email'));app.dispose();
}
{
 const app=await harness({mode:'signup',returnTo:exactReturn});assert.equal(app.input('auth-password').props.minLength,15);assert.equal(app.input('auth-password').props.maxLength,128);assert.equal(app.input('auth-password').props.autoComplete,'new-password');assert.match(app.text,/15\s+to\s+128 characters/);app.change('auth-name','Taylor');app.change('auth-email','buyer@example.test');app.change('auth-password','too short');await app.submit();assert.equal(app.requests.length,0);assert.equal(app.input('auth-password').props['aria-invalid'],true);assert.match(app.input('auth-password').props['aria-describedby'],/auth-error/);app.dispose();
}
{
 const token='synthetic-verification-token',app=await harness({mode:'verify',returnTo:exactReturn,token},`https://fivegen.test/verify-email?token=${token}&return_to=${encodeURIComponent(exactReturn)}`);
 assert.equal(app.requests.length,0,'A GET or page mount never consumes an emailed token');assert.equal(new URL(app.replacements[0],'https://fivegen.test').searchParams.has('token'),false);assert.equal(new URL(app.replacements[0],'https://fivegen.test').searchParams.get('return_to'),exactReturn);
 assert.equal(app.input('auth-password').props.autoComplete,'current-password');assert.match(app.text,/password you chose when signing up/);assert.match(app.text,/Only verify an account you created/);assert.doesNotMatch(renderToStaticMarkup(app.tree),new RegExp(token),'The secret is not rendered into markup or links');const recovery=app.find('a').find(link=>readable(link)==='Reset it.');assert.ok(recovery,'A mailbox owner can recover an unknown pending signup password');assert.equal(new URL(recovery.props.href,'https://fivegen.test').searchParams.get('return_to'),exactReturn);
 app.change('auth-password',password);const pending=app.submit();assert.deepEqual(JSON.parse(app.requests[0].options.body),{token,password,returnTo:exactReturn});assert.equal(app.requests[0].url,'/api/auth/verify-email');await app.respond(0,{verified:true,redirectTo:'/signin'});await pending;assert.match(app.text,/Email verified/);assert.equal(app.navigations.length,0,'Email verification never creates an authenticated client identity');
 const link=app.find('a').find(node=>readable(node).startsWith('Back to sign in'));const url=new URL(link.props.href,'https://fivegen.test');assert.equal(url.searchParams.get('verified'),'1');assert.equal(url.searchParams.get('return_to'),exactReturn);app.dispose();
}
{
 const app=await harness({mode:'verify',returnTo:exactReturn});assert.match(app.text,/Get a verification link/);app.change('auth-email','buyer@example.test');const pending=app.submit();assert.equal(app.requests[0].url,'/api/auth/resend-verification');await app.respond(0,{verificationRequired:true},202);await pending;assert.match(app.text,/Check your email/);app.dispose();
}
{
 const app=await harness({mode:'forgot',returnTo:exactReturn});assert.match(app.text,/Signed up with Google/);app.change('auth-email','maybe-known@example.test');const pending=app.submit();assert.equal(app.requests[0].url,'/api/auth/forgot-password');await app.respond(0,{message:'If eligible'},202);await pending;assert.match(app.text,/If this address is eligible/);assert.match(app.text,/Signed up with Google/);assert.equal(app.navigations.length,0);assert.doesNotMatch(app.text,/account exists|account not found|email sent/i);app.dispose();
}
{
 const token='synthetic-reset-token',app=await harness({mode:'reset',returnTo:exactReturn,token},`https://fivegen.test/reset-password?token=${token}`);assert.equal(app.requests.length,0);assert.equal(app.replacements[0],'/reset-password');assert.equal(app.input('auth-confirmation').props.autoComplete,'new-password');app.change('auth-password',password);app.change('auth-confirmation',password+' different');await app.submit();assert.equal(app.requests.length,0);assert.match(app.text,/passwords don’t match/);assert.equal(app.input('auth-confirmation').props['aria-invalid'],true);
 app.change('auth-confirmation',password);const pending=app.submit();assert.equal(app.requests[0].url,'/api/auth/reset-password');assert.deepEqual(JSON.parse(app.requests[0].options.body),{token,password,returnTo:exactReturn});await app.respond(0,{reset:true});await pending;assert.match(app.text,/Password updated/);assert.equal(app.navigations.length,0);const url=new URL(app.find('a').find(node=>readable(node).startsWith('Back to sign in')).props.href,'https://fivegen.test');assert.equal(url.searchParams.get('reset'),'1');assert.equal(url.searchParams.get('return_to'),exactReturn);app.dispose();
 const expired=await harness({mode:'reset',returnTo:exactReturn});assert.equal(expired.find('form').length,0,'A missing token cannot present an unusable password form');assert.equal(expired.find('input').length,0);assert.match(expired.text,/This reset link is missing. Request a new link to continue/);const retry=expired.find('a').find(link=>readable(link)==='Request a new password reset link');assert.ok(retry);assert.equal(new URL(retry.props.href,'https://fivegen.test').searchParams.get('return_to'),exactReturn);assert.equal(expired.requests.length,0);expired.dispose();
}
for(const notice of ['verified','reset']){const app=await harness({mode:'signin',notice});assert.match(app.text,notice==='verified'?/Your email is verified/:/Your password has been updated/);assert.equal(app.requests.length,0);app.dispose();}
// Email URLs intentionally contain no return_to. After mailbox proof the
// backend returns the original frozen destination; the success link retains it.
for(const mode of ['verify','reset']){
 const app=await harness({mode,token:'synthetic-token-only'},`https://fivegen.test/${mode==='verify'?'verify-email':'reset-password'}?token=synthetic-token-only`);app.change('auth-password',password);if(mode==='reset')app.change('auth-confirmation',password);const pending=app.submit();await app.respond(0,{...(mode==='verify'?{verified:true}:{reset:true}),redirectTo:'/signin?return_to='+encodeURIComponent(exactReturn)});await pending;const signIn=new URL(app.find('a').find(node=>readable(node).startsWith('Back to sign in')).props.href,'https://fivegen.test');assert.equal(signIn.searchParams.get('return_to'),exactReturn,'A token-only email link returns to the exact original buyer product');assert.equal(app.navigations.length,0);app.dispose();
}
for(const value of ['https://evil.test/signin?return_to=/customer','//evil.test/signin','/signup?return_to=/customer','/signin?return_to=https%3A%2F%2Fevil.test'])assert.equal(paths.authResultReturnPath(value,'/'),'/','An invalid server redirect cannot change the sign-in destination');
{
 const app=await harness({mode:'forgot'});app.change('auth-email','buyer@example.test');const pending=app.submit();await app.respond(0,null);await pending;assert.match(app.text,/We couldn’t complete that request/);assert.equal(app.button('Send reset link').props.disabled,false);app.dispose();
 const disposed=await harness({mode:'forgot'});disposed.change('auth-email','buyer@example.test');const abandoned=disposed.submit();disposed.dispose();assert.equal(disposed.requests[0].options.signal.aborted,true);await disposed.respond(0,{message:'Generic'},202);await abandoned;assert.equal(disposed.navigations.length,0);
}
console.log('Auth UI passed: actual shadcn/Radix native controls, persistent labels/names and inline error semantics, skip navigation, policy-bound hints, exact buyer return paths, safe Google gateway, real callbacks and busy/error states, verification/password proof, token URL redaction, generic recovery, no auto-login/terms acceptance and no persistent secrets.');
