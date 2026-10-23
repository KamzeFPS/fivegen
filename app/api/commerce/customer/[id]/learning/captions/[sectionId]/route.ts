import {failure} from '@/lib/server';
import {learnerCaptions} from '@/lib/product-learning-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;sectionId:string}>}){try{const {id,sectionId}=await params;return await learnerCaptions(req,id,sectionId);}catch(error){return failure(error);}}
