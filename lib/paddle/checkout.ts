import type { CheckoutOpenOptions, CheckoutSettings, PricePreviewParams, PricePreviewResponse } from '@paddle/paddle-js';
import { validCountryCode, type Tier } from './catalog';

export type LocalizedPrice = PricePreviewResponse['data']['details']['lineItems'][number];

export function previewRequest(tiers: Tier[], countryCode?: string): PricePreviewParams {
  const country = validCountryCode(countryCode);
  return {
    items: tiers.map(tier => ({ priceId: tier.priceId, quantity: 1 })),
    ...(country ? { address: { countryCode: country } } : {}),
  };
}

export function verifiedPrices(response: PricePreviewResponse, tiers: Tier[]): Record<string, LocalizedPrice> {
  return Object.fromEntries(tiers.map(tier => {
    const item = response.data.details.lineItems.find(line => line.price.id === tier.priceId);
    if (!item || item.quantity !== 1 || !item.formattedTotals?.total) {
      throw new Error('Paddle did not return all pack prices. Please refresh prices.');
    }
    if (item.price.billingCycle || item.price.trialPeriod) {
      throw new Error(`${tier.name} is configured as a recurring or trial price. This page only sells one-time credits.`);
    }
    return [tier.priceId, item];
  }));
}

export function checkoutSettings(origin: string): CheckoutSettings {
  return { displayMode: 'overlay', variant: 'one-page', theme: 'dark', successUrl: new URL('/welcome', origin).href, showAddDiscounts: false };
}

export function checkoutOptions(price: LocalizedPrice, origin: string, email?: string, address?: PricePreviewResponse['data']['address']): CheckoutOpenOptions {
  const countryCode = validCountryCode(address?.countryCode);
  return {
    items: [{ priceId: price.price.id, quantity: price.quantity }],
    settings: checkoutSettings(origin),
    ...(email ? {
      customer: {
        email,
        ...(countryCode ? { address: { countryCode, ...(address?.postalCode ? { postalCode: address.postalCode } : {}) } } : {}),
      },
    } : {}),
  };
}
