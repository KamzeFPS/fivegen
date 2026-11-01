import {guideStep,guideStepResources,type GuideStep} from './guide-content';

export type ChallengeDay=GuideStep;
type ChallengeSection=Parameters<typeof guideStep>[0];
/** Challenge activities use the same original sections and granted-file
 * selection as Guides. Learning completion and submissions remain server data. */
export function challengeDay(section:ChallengeSection,index=0):ChallengeDay{
 const meta=section.studio||{};
 return guideStep({...section,id:section.id||`challenge-day-${index}`,studio:{...meta,guideExample:meta.challengeExample,guideChecklist:meta.challengeChecklist,guideUploadIds:meta.challengeUploadIds,guideFileNames:meta.challengeFileNames}},index);
}
export const challengeDayResources=guideStepResources;
