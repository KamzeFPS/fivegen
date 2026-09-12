import assert from 'node:assert/strict';
import { resolve, relative, isAbsolute } from 'node:path';

// Refuse inherited production settings that could override --env-file values.
assert.equal(process.env.PADDLE_ENVIRONMENT, 'production', 'Select the live Paddle profile explicitly');
assert.equal(process.env.PADDLE_LIVE_RELEASE, 'staging', 'This preview must keep purchases locked');
assert.equal(process.env.PADDLE_WEBHOOK_IP_MODE, 'direct', 'Local staging must use the socket IP boundary');
assert.ok(!process.env.RENDER, 'This command is for local staging, not a customer deployment');
const origin = new URL(process.env.APP_ORIGIN || '');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Local staging requires a loopback origin');
assert.ok(process.env.FIVEGEN_DATA_DIR, 'Set a separate staging database directory');
const location = relative(resolve('outputs'), resolve(process.env.FIVEGEN_DATA_DIR));
assert.ok(location && !location.startsWith('..') && !isAbsolute(location), 'Staging data must remain inside this checkout’s outputs directory');
const { start } = await import('../runtime/render/server.mjs');
await start();
