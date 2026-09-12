import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64');
const catalogUrl = compile(readFileSync('lib/paddle/catalog.ts', 'utf8'));
const { parsePaddleConfig, validCountryCode, countryFromHeaders } = await import(catalogUrl);
const checkoutSource = readFileSync('lib/paddle/checkout.ts', 'utf8').replace("from './catalog'", `from '${catalogUrl}'`);
const { previewRequest, verifiedPrices, checkoutOptions } = await import(compile(checkoutSource));

const fixtureEnv = {
  PADDLE_ENVIRONMENT: 'sandbox', PADDLE_CLIENT_TOKEN: 'test_public_token_fixture',
  PADDLE_PRICE_STARTER: 'pri_' + 'a'.repeat(26),
  PADDLE_PRICE_PRO: 'pri_' + 'b'.repeat(26),
  PADDLE_PRICE_ADVANCED: 'pri_' + 'c'.repeat(26),
  PADDLE_API_KEY: 'server-secret-must-never-be-serialized',
};
const config = parsePaddleConfig(key => fixtureEnv[key] || '');
assert.equal(config.environment, 'sandbox');
assert.ok(!JSON.stringify(config).includes(fixtureEnv.PADDLE_API_KEY));
assert.throws(() => parsePaddleConfig(() => ''), /PADDLE_ENVIRONMENT/);
assert.throws(() => parsePaddleConfig(key => key === 'PADDLE_ENVIRONMENT' ? 'staging' : fixtureEnv[key]), /PADDLE_ENVIRONMENT/);
assert.throws(() => parsePaddleConfig(key => key === 'PADDLE_CLIENT_TOKEN' ? 'live_wrong_account' : fixtureEnv[key]), /test_/);
assert.throws(() => parsePaddleConfig(key => key === 'PADDLE_ENVIRONMENT' ? 'production' : fixtureEnv[key]), /live_/);
assert.throws(() => parsePaddleConfig(key => key === 'PADDLE_PRICE_PRO' ? fixtureEnv.PADDLE_PRICE_STARTER : fixtureEnv[key]), /repeats/);

for (const invalid of [undefined, null, '', 'OTHERS', 'XX', 'T1', 'ZZ', 'USA', 'US,CA']) {
  assert.equal(validCountryCode(invalid), undefined);
  assert.ok(!('address' in previewRequest(config.tiers, invalid)), 'Never pass a sentinel or empty address to Paddle');
}
assert.equal(countryFromHeaders(new Headers()), undefined);
assert.equal(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'gb' })), 'GB');
assert.equal(countryFromHeaders(new Headers({ 'cf-ipcountry': 'JP' })), 'JP');
assert.equal(countryFromHeaders(new Headers({ 'x-vercel-ip-country': 'OTHERS', 'cf-ipcountry': 'XX' })), undefined);
assert.deepEqual(previewRequest(config.tiers, 'MN').address, { countryCode: 'MN' });

// These are contract fixtures, not substituted Paddle calls. In particular,
// zero-decimal currencies and localized formatting must remain untouched.
const labels = ['¥2,000', '35,00\u00a0€', '₩100,000'];
const lineItems = config.tiers.map((tier, i) => ({
  price: { id: tier.priceId, billingCycle: null, trialPeriod: null }, quantity: 1,
  formattedTotals: { total: labels[i] },
}));
const preview = { data: { details: { lineItems }, address: { countryCode: 'JP', postalCode: null } } };
const prices = verifiedPrices(preview, config.tiers);
config.tiers.forEach((tier, i) => {
  assert.equal(prices[tier.priceId].formattedTotals.total, labels[i]);
  const options = checkoutOptions(prices[tier.priceId], 'http://localhost:5173', 'buyer@example.test', preview.data.address);
  assert.equal(options.items[0].priceId, tier.priceId);
  assert.equal(options.items[0].quantity, 1);
  assert.equal(options.settings.variant, 'one-page');
  assert.equal(options.settings.displayMode, 'overlay');
  assert.equal(options.settings.successUrl, 'http://localhost:5173/welcome');
  assert.equal(options.customer.email, 'buyer@example.test');
  assert.equal(options.customer.address.countryCode, 'JP');
});
assert.ok(!('customer' in checkoutOptions(lineItems[0], 'http://localhost:5173')));
assert.ok(!('address' in checkoutOptions(lineItems[0], 'http://localhost:5173', 'buyer@example.test', { countryCode: 'OTHERS' }).customer));
assert.throws(() => verifiedPrices({ data: { details: { lineItems: [] } } }, config.tiers), /all pack prices/);
const recurring = structuredClone(preview);
recurring.data.details.lineItems[0].price.billingCycle = { interval: 'month', frequency: 1 };
assert.throws(() => verifiedPrices(recurring, config.tiers), /recurring/);
const missingTotal = structuredClone(preview);
missingTotal.data.details.lineItems[0].formattedTotals = {};
assert.throws(() => verifiedPrices(missingTotal, config.tiers), /all pack prices/);
console.log('Paddle contract checks passed: explicit environment, token isolation, country sentinels, exact formatted totals and price IDs, one-time billing, signed-in email, and welcome URL.');
