import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../runtime/render/passwords.mjs';

// Exercise Node's real scrypt and its bounded queue; no credentials, env files,
// database or external requests. Generated hashes remain only in this process.
const phrase='  An exact passphrase with ä and 🔒  ',hash=await hashPassword(phrase);
assert.match(hash,/^scrypt\$32768\$8\$3\$/);assert.equal(await verifyPassword(phrase,hash),true);assert.equal(await verifyPassword(phrase.trim(),hash),false,'Passwords are never trimmed or silently normalized');assert.equal(await verifyPassword(phrase,hash.replace('$32768$','$1073741824$')),false,'Corrupt/untrusted parameters cannot request an unbounded memory allocation');
const burst=await Promise.allSettled(Array.from({length:12},(_,index)=>hashPassword('A private fixture passphrase '+index)));
assert.equal(burst.filter(result=>result.status==='fulfilled').length,10,'At most two active jobs plus eight waiters are admitted');const refused=burst.filter(result=>result.status==='rejected');assert.equal(refused.length,2);assert.ok(refused.every(result=>result.reason.status===429));
const after=await hashPassword('A final recovery passphrase');assert.equal(await verifyPassword('A final recovery passphrase',after),true,'Slots are reusable after load settles');
console.log('Password hashing passed: salted scrypt32MiB/r8/p3, exact Unicode/whitespace comparison, safe corrupt-hash handling, two-job/eight-waiter bound, overload rejection and slot recovery. No user data or external calls.');
