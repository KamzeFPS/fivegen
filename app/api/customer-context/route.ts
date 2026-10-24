import {ApiError,failure,identity} from '@/lib/server';
import {ownerAudience} from '@/lib/audience-server';
import {resolveAudiencePerson} from '@/lib/audience';
import {customerDestination} from '@/lib/customer-destination';
/** Owner-only opaque person resolution for a scoped tool handoff. */
export async function GET(req:Request){try{const user=await identity(),params=new URL(req.url).searchParams,productId=(params.get('product')||'').slice(0,100),reference=(params.get('person')||'').slice(0,300),audience=await ownerAudience(user.userId,productId),person=resolveAudiencePerson(audience.people,reference);if(!person)throw new ApiError('This person is unavailable in the selected product or workspace.',404);return Response.json({person:{reference:person.reference,email:person.email,name:person.name,products:person.products,orders:person.orders,applications:person.applications},returnPath:customerDestination({productId,person:reference})},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
