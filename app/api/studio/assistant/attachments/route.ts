import {failure,identity,sameOrigin} from '@/lib/server';
import {createWorkspaceAttachments,readWorkspaceAttachmentForm} from '@/lib/workspace-attachments-server';
export async function POST(request:Request){try{sameOrigin(request);const user=await identity();return Response.json(await createWorkspaceAttachments(user.userId,await readWorkspaceAttachmentForm(request)),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');return response;}}
