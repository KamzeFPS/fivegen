import {AuthScreen,type AuthMode} from './auth-screen';
import {authReturnPath} from './auth-paths';
export type AuthSearchParams={return_to?:string;token?:string;verified?:string;reset?:string};
export async function AuthPage({mode,searchParams}:{mode:AuthMode;searchParams:Promise<AuthSearchParams>}){
 const query=await searchParams,returnTo=authReturnPath(typeof query.return_to==='string'?query.return_to:'/');
 const token=typeof query.token==='string'&&query.token.length<=512?query.token:'';
 return <AuthScreen mode={mode} returnTo={returnTo} token={token} notice={query.verified==='1'?'verified':query.reset==='1'?'reset':''}/>;
}
