import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {createCalendarEvent,updateCalendarEvent} from '@/lib/workspace-calendar-server';
const headers={'Cache-Control':'private, no-store'};
function failed(error:unknown){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}
export async function POST(request:Request){try{sameOrigin(request);const user=await identity();return Response.json({event:await createCalendarEvent(user.userId,await readCreatorContextJson(request,65536))},{headers,status:201});}catch(error){return failed(error);}}
export async function PATCH(request:Request){try{sameOrigin(request);const user=await identity();return Response.json({event:await updateCalendarEvent(user.userId,await readCreatorContextJson(request,65536))},{headers});}catch(error){return failed(error);}}
