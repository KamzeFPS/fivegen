import {database} from './server';

// Terms acceptance records are written from the verified server-side identity,
// never from a submitted email. Resolve by owner so MCP receives the same access.
export async function hasUnlimitedGeneration(owner:string):Promise<boolean>{
  const account=await database().prepare('SELECT email FROM terms_acceptances WHERE owner=? ORDER BY accepted_at DESC LIMIT 1').bind(owner).first<{email:string}>();
  return account?.email.trim().toLowerCase()==='kamzewac@gmail.com';
}
