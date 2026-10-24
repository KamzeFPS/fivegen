const authPaths=new Set(['/signin','/signup','/forgot-password','/reset-password','/verify-email','/signin-with-chatgpt','/signout-with-chatgpt','/callback']);
export const AUTH_PASSWORD_MIN_LENGTH=15;
export const AUTH_PASSWORD_MAX_LENGTH=128;
export function authReturnPath(value?:string){
 if(!value?.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return '/';
 try{const url=new URL(value,'https://fivegen.invalid'),path=decodeURIComponent(url.pathname).replace(/\/+$/,'')||'/';return url.origin==='https://fivegen.invalid'&&!authPaths.has(path)&&path!=='/api/auth'&&!path.startsWith('/api/auth/')?url.pathname+url.search+url.hash:'/';}catch{return '/';}
}
export function authPageLink(path:string,returnTo:string){return `${path}?return_to=${encodeURIComponent(authReturnPath(returnTo))}`;}
export function authResultReturnPath(redirectTo:string|undefined,fallback:string){
 try{if(!redirectTo?.startsWith('/')||redirectTo.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(redirectTo))return authReturnPath(fallback);const url=new URL(redirectTo,'https://fivegen.invalid');return url.origin==='https://fivegen.invalid'&&url.pathname==='/signin'?authReturnPath(url.searchParams.get('return_to')||fallback):authReturnPath(fallback);}catch{return authReturnPath(fallback);}
}
