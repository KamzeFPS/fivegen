import {redirect} from 'next/navigation';
import {getChatGPTUser,safeRelativeReturnPath,chatGPTSignInPath} from '../chatgpt-auth';
import {acceptedTerms,TERMS_VERSION} from '@/lib/terms';
import {TermsConsent} from './terms-consent';
import {CheckoutWelcome} from './checkout-welcome';
import '../pricing/pricing.css';
export const dynamic='force-dynamic';
export default async function Welcome({searchParams}:{searchParams:Promise<{return_to?:string;session_id?:string}>}){
 const q=await searchParams,path=safeRelativeReturnPath(q.return_to||'/');
 const returnTo=path.startsWith('/welcome')?'/':path;
 const user=await getChatGPTUser();
 // Explicit onboarding return paths retain their existing consent flow.
 // Checkout returns without an onboarding return path.
 if(!q.return_to){const receiptPath=q.session_id&&/^cs_(test|live)_[a-zA-Z0-9]+$/.test(q.session_id)?`/welcome?session_id=${encodeURIComponent(q.session_id)}`:'/welcome?return_to=%2F';return <CheckoutWelcome signedIn={Boolean(user)} continueTo={user?'/':chatGPTSignInPath(receiptPath)}/>;}
 if(!user)redirect(chatGPTSignInPath(`/welcome?return_to=${encodeURIComponent(returnTo)}`));
 if(await acceptedTerms(user.userId))redirect(returnTo);
 return <TermsConsent email={user.email} returnTo={returnTo} termsVersion={TERMS_VERSION}/>;
}
