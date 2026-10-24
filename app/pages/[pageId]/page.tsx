import {notFound} from 'next/navigation';
import {ApiError} from '@/lib/server';
import {getPublicPage} from '@/lib/public-pages-server';
import {SalesLandingPage} from '@/app/sales-landing-page';
import '@/app/sales-page-studio.css';
export const dynamic='force-dynamic';export const revalidate=0;
export async function generateMetadata({params}:{params:Promise<{pageId:string}>}){try{const page=await getPublicPage((await params).pageId);return {title:page.config.seoTitle||page.product.title,description:page.config.seoDescription||page.product.description.slice(0,300)};}catch{return {title:'Page unavailable',robots:{index:false,follow:false}};}}
export default async function PublicPage({params}:{params:Promise<{pageId:string}>}){const page=await getPublicPage((await params).pageId).catch(e=>{if(e instanceof ApiError&&e.status===404)notFound();throw e;});return <main className="product-public-shell"><SalesLandingPage {...page} pageId={page.pageId} pageVersion={page.publishedAt} iconUrl={page.config.iconUploadId?`/api/public-pages/${page.pageId}/media/icon`:null} bannerUrl={page.config.bannerUploadId?`/api/public-pages/${page.pageId}/media/banner`:null}/></main>;}
