import {failure,sameOrigin} from '@/lib/server';
import {customerOrder} from '@/lib/commerce-v2-server';
import {changeTeamSeat,listTeamSeats} from '@/lib/product-team-server';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,order=await customerOrder(req,id,true,{purchaserOnly:true}),offset=Number(new URL(req.url).searchParams.get('offset')||0);return Response.json(await listTeamSeats(order,offset),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const {id}=await params,order=await customerOrder(req,id,true,{purchaserOnly:true});return Response.json(await changeTeamSeat(order,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
