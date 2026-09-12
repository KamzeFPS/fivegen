export interface Tier {
  name: 'Starter' | 'Pro' | 'Advanced';
  description: string;
  features: string[];
  priceId: string;
  packId: 'starter' | 'studio' | 'scale';
  credits: number;
  featured?: boolean;
}

// Edit names, descriptions, and features here. Price IDs come from runtime
// environment variables so sandbox and production catalogs cannot get mixed.
export const tierDefinitions = [
  {
    name: 'Starter',
    packId: 'starter',
    credits: 1000,
    description: 'For your next idea and your first launch.',
    features: ['1,000 AI credits', 'AI products, images, and videos', 'Purchased credits never expire'],
  },
  {
    name: 'Pro',
    packId: 'studio',
    credits: 2500,
    description: 'For creators building their next chapter.',
    features: ['2,500 AI credits', 'AI products, images, and videos', 'Purchased credits never expire'],
    featured: true,
  },
  {
    name: 'Advanced',
    packId: 'scale',
    credits: 6000,
    description: 'For a full pipeline of ideas to bring to life.',
    features: ['6,000 AI credits', 'AI products, images, and videos', 'Purchased credits never expire'],
  },
] satisfies Omit<Tier, 'priceId'>[];

export interface PaddlePublicConfig {
  environment: 'sandbox' | 'production';
  clientToken: string;
  tiers: Tier[];
}

export class PaddleConfigurationError extends Error {}

export function parsePaddleConfig(read: (key: string) => string): PaddlePublicConfig {
  const environment = read('PADDLE_ENVIRONMENT').trim();
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new PaddleConfigurationError('Set PADDLE_ENVIRONMENT explicitly to sandbox or production. No environment has been selected.');
  }
  const clientToken = read('PADDLE_CLIENT_TOKEN').trim();
  const prefix = environment === 'sandbox' ? 'test_' : 'live_';
  if (!clientToken.startsWith(prefix) || clientToken.length <= prefix.length) {
    throw new PaddleConfigurationError(`Set PADDLE_CLIENT_TOKEN to a ${prefix} client-side token for the selected ${environment} environment.`);
  }
  const used = new Set<string>();
  const tiers = tierDefinitions.map(tier => {
    const key = `PADDLE_PRICE_${tier.name.toUpperCase()}`;
    const priceId = read(key).trim();
    if (!/^pri_[a-z0-9]{26}$/.test(priceId)) throw new PaddleConfigurationError(`Set ${key} to its Paddle one-time price ID.`);
    if (used.has(priceId)) throw new PaddleConfigurationError(`${key} repeats another pack. Each pack must have its own price ID.`);
    used.add(priceId);
    return { ...tier, priceId };
  });
  return { environment, clientToken, tiers };
}

// Accept actual ISO 3166-1 alpha-2 values only. CDN sentinels (XX, T1,
// OTHERS) and malformed/untrusted values remain app-side and are omitted.
const countries = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));

export function validCountryCode(value: string | null | undefined): string | undefined {
  const country = value?.trim().toUpperCase();
  return country && countries.has(country) ? country : undefined;
}

export function countryFromHeaders(requestHeaders: Pick<Headers, 'get'>): string | undefined {
  return validCountryCode(requestHeaders.get('x-vercel-ip-country'))
    ?? validCountryCode(requestHeaders.get('cf-ipcountry'));
}
