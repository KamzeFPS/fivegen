import {AuthPage,type AuthSearchParams} from '../auth/auth-page';
export const dynamic='force-dynamic';
export const metadata={title:'Sign in · FiveGen',description:'Sign in to your FiveGen workspace and purchased products.',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function SignIn({searchParams}:{searchParams:Promise<AuthSearchParams>}){return <AuthPage mode="signin" searchParams={searchParams}/>;}
