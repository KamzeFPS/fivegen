import {AuthPage,type AuthSearchParams} from '../auth/auth-page';
export const dynamic='force-dynamic';
export const metadata={title:'Create an account · FiveGen',description:'Create your FiveGen account with Google or your email.',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function SignUp({searchParams}:{searchParams:Promise<AuthSearchParams>}){return <AuthPage mode="signup" searchParams={searchParams}/>;}
