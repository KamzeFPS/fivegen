import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {createCalendarAccount,listCalendarAccounts,updateCalendarAccount} from '@/lib/workspace-calendar-server';
const headers={'Cache-Control':'private, no-store'};
function failed(error:unknown){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}
export async function GET(){try{const user=await identity();return Response.json({accounts:await listCalendarAccounts(user.userId)},{headers});}catch(error){return failed(error);}}
export async function POST(request:Request){try{sameOrigin(request);const user=await identity();return Response.json({account:await createCalendarAccount(user.userId,await readCreatorContextJson(request,8192))},{headers,status:201});}catch(error){return failed(error);}}
export async function PATCH(request:Request){try{sameOrigin(request);const user=await identity();return Response.json({account:await updateCalendarAccount(user.userId,await readCreatorContextJson(request,8192))},{headers});}catch(error){return failed(error);}}
