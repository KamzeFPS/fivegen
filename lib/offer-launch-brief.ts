import type { GrowthBrief } from './growth';
import type { OfferStudy } from './offer-lab';
export function offerBriefChanges(study:OfferStudy,variant:'a'|'b',brief:GrowthBrief){const selected=study[variant];return {icp:selected.audience,problem:study.problem||brief.problem,promise:selected.outcome,offer:`${selected.title}\n${selected.includes}\nResearch-only price hypothesis: ${selected.currency.toUpperCase()} ${selected.price}. This is not an approved checkout price; verify live terms before including price in sales copy.`};}
