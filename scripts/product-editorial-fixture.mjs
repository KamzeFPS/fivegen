// Synthetic test fixtures must follow the same explicit approval
// actions as a creator. This helper does not bypass the publication guard.
export async function approveCurrentEditorialForFixture(server,productId,owner){
 let review=await server.getEditorialReview(productId,owner);
 const stamp=()=>({expectedVersion:review.version,fingerprint:review.fingerprint,expectedUpdatedAt:review.updatedAt});
 if(!review.approved)review=await server.editorialReviewAction(productId,owner,{...stamp(),action:'approve',attested:true});
 return review;
}
