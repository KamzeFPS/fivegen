import {redirect} from 'next/navigation';
import {getChatGPTUser,safeRelativeReturnPath,chatGPTSignInPath} from '../chatgpt-auth';
import {acceptedTerms} from '@/lib/terms';
import {TermsConsent} from './terms-consent';
import {CheckoutWelcome} from './checkout-welcome';
import '../pricing/pricing.css';
export const dynamic='force-dynamic';
export default async function Welcome({searchParams}:{searchParams:Promise<{return_to?:string}>}){
 const q=await searchParams,path=safeRelativeReturnPath(q.return_to||'/');
 const returnTo=path.startsWith('/welcome')?'/':path;
 const user=await getChatGPTUser();
 // Explicit onboarding return paths retain their existing consent flow.
 // Paddle returns to /welcome without a query, which remains a stable page.
 if(!q.return_to)return <CheckoutWelcome signedIn={Boolean(user)} continueTo={user?'/':chatGPTSignInPath('/welcome?return_to=%2F')}/>;
 if(!user)redirect(chatGPTSignInPath(`/welcome?return_to=${encodeURIComponent(returnTo)}`));
 if(await acceptedTerms(user.userId))redirect(returnTo);
 return <TermsConsent email={user.email} returnTo={returnTo}/>;
}
