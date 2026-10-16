import {isAdmin} from '@/lib/admin';
import {identity} from '@/lib/server';
import CreditGrantForm from './form';

export default async function AdminCreditsPage(){
  const user=await identity();
  if(!isAdmin(user))return <main className="gen-settings"><h1>Administrator access required</h1></main>;
  return <main className="gen-settings"><span className="eyebrow">FIVEGEN ADMIN</span><h1>Grant AI credits</h1><p>Add non-expiring credits to an existing account.</p><CreditGrantForm/></main>;
}
