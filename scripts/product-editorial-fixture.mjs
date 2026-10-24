// Synthetic test fixtures must follow the same acknowledgement and approval
// actions as a creator. This helper does not bypass the publication guard.
export async function approveCurrentEditorialForFixture(server,productId,owner){
 let review=await server.getEditorialReview(productId,owner);
 const stamp=()=>({expectedVersion:review.version,fingerprint:review.fingerprint,expectedUpdatedAt:review.updatedAt});
 if(review.summary.remaining)review=await server.editorialReviewAction(productId,owner,{...stamp(),action:'acknowledge-all',note:'Synthetic fixture: read every flagged passage and retained the intentionally authored test content.',attested:true});
 if(!review.approved)review=await server.editorialReviewAction(productId,owner,{...stamp(),action:'approve',note:'Synthetic fixture: original test content and every editorial prompt were reviewed for this exact saved version.',attested:true});
 return review;
}
