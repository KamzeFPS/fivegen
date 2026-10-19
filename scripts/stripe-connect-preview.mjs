import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

// Local test-only preview. Keep the CLI's signing secret in child-process memory,
// never in source, logs, browser code, or the user's production configuration.
assert.equal(process.env.STRIPE_MODE, 'test', 'The Connect preview requires STRIPE_MODE=test.');
assert.ok(/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || ''), 'Configure a Stripe test key in .env.render.local.');
assert.ok(!process.env.RENDER, 'Do not run the fixture preview on a public host.');
const events = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed', 'account.updated'];
const listener = spawn(process.env.STRIPE_CLI_BIN || 'stripe', ['listen', '--skip-update', '--color', 'off', '--events-from', '@accounts', '--events', events.join(','), '--forward-connect-to', 'http://localhost:5184/api/commerce/webhook'], {
  env: {...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_DEVICE_NAME: 'fivegen-local-connect-preview'},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let preview, closing = false, buffer = '', started = false;
const scrub = value => value.replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+/g, '[redacted]');
function stop(code) {
  if (closing) return;
  closing = true; clearTimeout(deadline);
  preview?.kill('SIGTERM'); listener.kill('SIGTERM');
  process.exitCode = code;
}
const deadline = setTimeout(() => { console.error('Stripe forwarding did not become ready within 30 seconds.'); stop(1); }, 30000);
function receive(chunk) {
  buffer = (buffer + chunk.toString()).slice(-16000);
  const match = buffer.match(/whsec_[A-Za-z0-9_]+(?=\s)/);
  if (started || !match) return;
  started = true; clearTimeout(deadline);
  console.log('Stripe Connect test forwarding is ready. The signing secret stays in memory.');
  preview = spawn(process.execPath, ['scripts/studio-preview.mjs'], {env: {...process.env, PADDLE_ENVIRONMENT: 'sandbox', STRIPE_CONNECT_WEBHOOK_SECRET: match[0], STRIPE_COMMERCE_ENABLED: 'true'}, stdio: 'inherit'});
  preview.once('error', error => { console.error(scrub(error.message)); stop(1); });
  preview.once('exit', code => stop(code || 0));
}
listener.stdout.on('data', receive); listener.stderr.on('data', receive);
listener.once('error', error => { console.error(scrub(error.message)); console.error('Install the official Stripe CLI or set STRIPE_CLI_BIN to its executable.'); stop(1); });
listener.once('exit', code => { if (!closing) { console.error(started ? 'Stripe forwarding stopped; closing the local payment preview.' : scrub(buffer).slice(-1600)); stop(code || 1); } });
process.once('SIGINT', () => stop(0)); process.once('SIGTERM', () => stop(0));
