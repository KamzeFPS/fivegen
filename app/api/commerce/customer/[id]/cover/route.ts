import {failure} from '@/lib/server';
import {customerCover} from '@/lib/commerce-v2-server';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{return await customerCover(req,(await params).id);}
 catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Vary','Cookie');return response;}
}
