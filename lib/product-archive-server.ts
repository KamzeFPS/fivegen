import {z} from 'zod';
import {ApiError,database,ownedProduct} from './server';

export const productArchiveSchema=z.object({action:z.enum(['archive','restore']),expectedUpdatedAt:z.number().int().nonnegative()}).strict();
export async function getProductArchive(productId:string,owner:string){
 const product=await ownedProduct(productId,owner),archived=product.archived_at!=null;
 const events=await database().prepare('SELECT id,action,created_at FROM product_archive_events WHERE product_id=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(productId,owner).all();
 return {product:{id:String(product.id),title:String(product.title),archivedAt:archived?Number(product.archived_at):null,updatedAt:Number(product.updated_at)},archived,effects:{newSales:archived?'paused':'unchanged',publicPages:archived?'private':'unchanged',emails:archived?'paused':'unchanged',existingAccess:'retained'},history:events.results.map(event=>({id:String(event.id),action:event.action as 'archive'|'restore',createdAt:Number(event.created_at)})),notice:archived?'Public pages and new checkout are paused. Email sequences are paused and queued marketing waits. Existing purchases, active subscriptions, customer access and transactional service messages remain intact. A payment or email request already in progress may still complete.':'Restoring never republishes pages, starts sales or resumes email. Review each step in Launch review before enabling it.'};
}

/** The archive trigger applies all visibility/send holds and appends history in
 * the same transaction as this owner/revision-guarded update. Nothing is deleted. */
export async function setProductArchive(productId:string,owner:string,input:unknown){
 const value=productArchiveSchema.parse(input),product=await ownedProduct(productId,owner);
 if(Number(product.updated_at)!==value.expectedUpdatedAt)throw new ApiError('This product changed. Reload before changing its archive state.',409);
 const archived=product.archived_at!=null;
 if(archived===(value.action==='archive'))return getProductArchive(productId,owner);
 const now=Math.max(Date.now(),value.expectedUpdatedAt+1),next=value.action==='archive'?now:null;
 const result=await database().prepare('UPDATE products SET archived_at=?,updated_at=? WHERE id=? AND owner=? AND updated_at=? AND ((?=1 AND archived_at IS NULL) OR (?=0 AND archived_at IS NOT NULL))').bind(next,now,productId,owner,value.expectedUpdatedAt,+(value.action==='archive'),+(value.action==='archive')).run();
 if(!result.meta.changes)throw new ApiError('This product changed while updating its archive state. Reload and review it again.',409);
 return getProductArchive(productId,owner);
}
