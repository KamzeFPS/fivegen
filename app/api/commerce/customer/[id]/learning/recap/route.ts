import {failure} from '@/lib/server';
import {learningChallengeRecap} from '@/lib/product-learning-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return await learningChallengeRecap(req,(await params).id);}catch(error){return failure(error);}}
