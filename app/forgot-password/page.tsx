import {AuthPage,type AuthSearchParams} from '../auth/auth-page';
export const dynamic='force-dynamic';
export const metadata={title:'Reset your password · FiveGen',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function ForgotPassword({searchParams}:{searchParams:Promise<AuthSearchParams>}){return <AuthPage mode="forgot" searchParams={searchParams}/>;}
