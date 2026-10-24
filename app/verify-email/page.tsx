import {AuthPage,type AuthSearchParams} from '../auth/auth-page';
export const dynamic='force-dynamic';
export const metadata={title:'Verify your email · FiveGen',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function VerifyEmail({searchParams}:{searchParams:Promise<AuthSearchParams>}){return <AuthPage mode="verify" searchParams={searchParams}/>;}
