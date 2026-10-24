import {AuthPage,type AuthSearchParams} from '../auth/auth-page';
export const dynamic='force-dynamic';
export const metadata={title:'Choose a new password · FiveGen',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function ResetPassword({searchParams}:{searchParams:Promise<AuthSearchParams>}){return <AuthPage mode="reset" searchParams={searchParams}/>;}
