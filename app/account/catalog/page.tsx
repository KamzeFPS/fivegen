import type {Metadata} from 'next';
import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {getCreatorCatalog} from '@/lib/creator-catalog-server';
import {CreatorCatalogSettings} from './settings';
import '../../pricing/pricing.css';
import '../../creator/catalog.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Creator catalog — FiveGen'};
export default async function CreatorCatalogSettingsPage(){const user=await requireChatGPTUser('/account/catalog');return <CreatorCatalogSettings initial={await getCreatorCatalog(user.userId)}/>;}
