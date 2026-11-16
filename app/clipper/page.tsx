import type { Metadata } from 'next';
import { binding } from '@/lib/server';
import { ClipperLanding } from './clipper-landing';
import { ClipperLocale } from './locale';
import './landing.css';

export const dynamic = 'force-dynamic';

type ClipperSearchParams=Promise<Record<string,string|string[]|undefined>>;
export async function generateMetadata({searchParams}:{searchParams:ClipperSearchParams}):Promise<Metadata>{
  const lang=(await searchParams).lang==='en'?'en':'mn';
  const title=lang==='mn'?'FiveGen Clipper — Клип бүтээ. Нөлөөгөө тэл.':'FiveGen Clipper — Make clips. Make an impact.';
  const description=lang==='mn'?'Кампанит ажлаа сонгож, шилдэг мөчийг богино клип болгоорой. Өөрийн бүтээлээ илгээж, зөвшөөрөгдсөн ажлаараа урамшуулал авах боломжтой.':'Find clipping campaigns, turn great moments into short videos, and submit your work for rewards.';
  return {
    title,description,robots:{index:true,follow:true},
    alternates:{canonical:'https://clipper.fivegen.ai/'+(lang==='en'?'?lang=en':''),languages:{mn:'https://clipper.fivegen.ai/?lang=mn',en:'https://clipper.fivegen.ai/?lang=en'}},
    openGraph:{title,description,url:'https://clipper.fivegen.ai/',type:'website',locale:lang==='mn'?'mn_MN':'en_US',alternateLocale:lang==='mn'?'en_US':'mn_MN'},
  };
}

export default async function ClipperPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  let appOrigin = 'https://www.fivegen.ai';
  try { appOrigin = new URL(binding('APP_ORIGIN') || appOrigin).origin; } catch { /* Use the canonical FiveGen origin. */ }
  const lang=query.lang==='en'?'en':'mn';
  return <><ClipperLocale lang={lang}/><ClipperLanding lang={lang} appOrigin={appOrigin} /></>;
}
