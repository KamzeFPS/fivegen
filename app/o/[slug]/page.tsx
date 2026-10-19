import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/server';
import { publicOfferStudy } from '@/lib/offer-lab-server';
import { OfferSurvey } from '@/app/offer-survey';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Help shape this offer · FiveGen', robots: { index: false, follow: false } };
export default async function OfferSurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const experiment = await publicOfferStudy(slug).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  return <OfferSurvey slug={experiment.slug} revision={experiment.revision} study={experiment.study}/>;
}
