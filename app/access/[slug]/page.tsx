import FileSaleAccess from './view';
export const dynamic='force-dynamic';
export const metadata={referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{slug:string}>}){return <FileSaleAccess slug={(await params).slug}/>;}
