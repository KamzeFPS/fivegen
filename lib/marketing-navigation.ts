import type {MarketingPluginId} from './marketing-plugins';

export type MarketingDestination='dashboard'|'results'|MarketingPluginId;
export const marketingGroups=[
 {id:'plan',label:'Plan',description:'Choose a goal and map the customer journey.',defaultTab:'dashboard'},
 {id:'create',label:'Create',description:'Prepare your video, pages and campaign assets.',defaultTab:'campaigns'},
 {id:'follow-up',label:'Follow up',description:'Review the emails your leads and customers receive.',defaultTab:'automations'},
 {id:'results',label:'Results',description:'See recorded activity and choose your next action.',defaultTab:'results'},
] as const;
export type MarketingGroup=typeof marketingGroups[number]['id'];
export function marketingGroupFor(tab:MarketingDestination):MarketingGroup{
 if(tab==='results')return 'results';
 if(tab==='automations')return 'follow-up';
 if(['vsl','funnel','campaigns'].includes(tab))return 'create';
 return 'plan';
}
