import {redirect} from 'next/navigation';
import {getChatGPTUser,safeRelativeReturnPath,chatGPTSignInPath} from '../chatgpt-auth';
import {acceptedTerms} from '@/lib/terms';
import {TermsConsent} from './terms-consent';
export const dynamic='force-dynamic';
export default async function Welcome({searchParams}:{searchParams:Promise<{return_to?:string}>}){
 const q=await searchParams,path=safeRelativeReturnPath(q.return_to||'/');
 const returnTo=path.startsWith('/welcome')?'/':path;
 const user=await getChatGPTUser();if(!user)redirect(chatGPTSignInPath(`/welcome?return_to=${encodeURIComponent(returnTo)}`));
 if(await acceptedTerms(user.userId))redirect(returnTo);
 return <TermsConsent email={user.email} returnTo={returnTo}/>;
}
