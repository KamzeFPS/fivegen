import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getChatGPTUser } from '../chatgpt-auth';
import { binding } from '@/lib/server';
import { countryFromHeaders, PaddleConfigurationError, parsePaddleConfig } from '@/lib/paddle/catalog';
import { Pricing } from './pricing';
import './pricing.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'AI Credits — FiveGen', description: 'One-time AI credits for your next idea. Local prices and secure checkout with Paddle.' };

export default async function PricingPage() {
  const [requestHeaders, user] = await Promise.all([headers(), getChatGPTUser()]);
  const countryCode = countryFromHeaders(requestHeaders);
  try {
    // Only this allowlisted public config crosses the server/client boundary.
    // A Paddle API key is never read or serialized into this page.
    const config = parsePaddleConfig(binding);
    return <Pricing config={config} countryCode={countryCode} email={user?.email} />;
  } catch (error) {
    if (!(error instanceof PaddleConfigurationError)) throw error;
    return <Pricing configurationError={error.message} />;
  }
}
