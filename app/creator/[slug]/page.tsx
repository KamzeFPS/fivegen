import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ApiError} from '@/lib/server';
import {getPublicCreatorCatalog} from '@/lib/creator-catalog-server';
import {CreatorCatalogView} from '../catalog-view';
import '../catalog.css';
import {publicPageMetadata} from '@/lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{try{const {slug}=await params,catalog=await getPublicCreatorCatalog(slug);return publicPageMetadata({title:catalog.title+' | FiveGen',description:catalog.tagline,path:'/creator/'+encodeURIComponent(slug)});}catch{return {title:'Creator catalog unavailable',robots:{index:false}};}}
export default async function CreatorCatalogPage({params}:{params:Promise<{slug:string}>}){try{const catalog=await getPublicCreatorCatalog((await params).slug);return <CreatorCatalogView {...catalog}/>;}catch(error){if(error instanceof ApiError&&error.status===404)notFound();throw error;}}
