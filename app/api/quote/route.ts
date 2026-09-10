import { selectionSchema } from "@/lib/commerce";
import { failure, sameOrigin } from "@/lib/server";
import { quoteProduct } from "@/lib/offers-server";
export async function POST(req:Request){try{sameOrigin(req);const s=selectionSchema.parse(await req.json());const {quote}=await quoteProduct(s.slug,s.quantity,s.code,s.addUpsell);return Response.json(quote);}catch(e){return failure(e);}}
