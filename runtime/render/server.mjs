import { readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStorage } from './storage.mjs';
import { createAuth, stripHeaders } from './auth.mjs';
import { createPaddleWebhookIpGuard } from './paddle-webhook-ips.mjs';

export function readConfig(source = process.env) {
  const origin = new URL(source.APP_ORIGIN || source.RENDER_EXTERNAL_URL || '');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))))
    throw new Error('APP_ORIGIN must be an HTTPS origin (localhost HTTP is allowed for testing)');
  if (source.RENDER && origin.protocol !== 'https:') throw new Error('Render requires an HTTPS origin');
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CREDENTIAL_ENCRYPTION_KEY', 'FIVEGEN_DATA_DIR'])
    if (!source[name]?.trim()) throw new Error(`Set ${name} before starting FiveGen`);
  if (source.CREDENTIAL_ENCRYPTION_KEY.length < 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters');
  const port = Number(source.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const redirectHosts = new Set();
  // Only aliases derived from trusted deployment configuration may redirect.
  // Never trust an arbitrary Host or X-Forwarded-Host header.
  if (source.RENDER_EXTERNAL_URL) {
    const renderOrigin = new URL(source.RENDER_EXTERNAL_URL);
    if (renderOrigin.protocol !== 'https:' || !renderOrigin.hostname.endsWith('.onrender.com') ||
        renderOrigin.username || renderOrigin.password || renderOrigin.port)
      throw new Error('RENDER_EXTERNAL_URL must be the service HTTPS onrender.com origin');
    redirectHosts.add(renderOrigin.host);
  }
  if (origin.hostname.startsWith('www.')) redirectHosts.add(origin.host.slice(4));
  redirectHosts.delete(origin.host);
  return { origin: origin.origin, redirectHosts, port, googleClientId: source.GOOGLE_CLIENT_ID, googleClientSecret: source.GOOGLE_CLIENT_SECRET };
}

export async function start() {
  process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
  const config = readConfig();
  const build = JSON.parse(readFileSync('dist/fivegen-runtime.json', 'utf8'));
  if (build.runtime !== 'render') throw new Error('Run npm run build:render before start:render');
  process.env.APP_ORIGIN = config.origin;
  process.env.MCP_ORIGIN = config.origin;
  process.env.VINEXT_TRUST_PROXY = '1';
  const storage = getStorage();
  const auth = createAuth(config, storage);
  const allowPaddleWebhookSource = createPaddleWebhookIpGuard();
  const { startProdServer } = await import('vinext/server/prod-server');
  // Initialize Vinext on loopback, then install our authentication boundary
  // before exposing the same production server on Render's public port.
  const { server } = await startProdServer({ host: '127.0.0.1', port: 0, outDir: resolve('dist'), silent: true });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const handlers = server.listeners('request');
  server.removeAllListeners('request');
  let stopping = false;
  server.on('request', async (req, res) => {
    try {
      const webhookSource = { socket: { remoteAddress: req.socket.remoteAddress }, headers: { 'x-forwarded-for': req.headers['x-forwarded-for'], 'cf-ray': req.headers['cf-ray'] } };
      stripHeaders(req, name => name.startsWith('oai-authenticated-user-') || name.startsWith('x-forwarded-') || name === 'forwarded');
      const authority = new URL(config.origin);
      const host = String(req.headers.host || '').toLowerCase();
      const domain = process.env.PRODUCT_DOMAIN?.trim().toLowerCase();
      const productHost = domain && host.endsWith('.' + domain) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(host.slice(0, -domain.length - 1));
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) { res.writeHead(400); res.end(); return; }
      const url = new URL(req.url, config.origin);
      if (url.origin !== config.origin) { res.writeHead(400); res.end(); return; }
      // Recreate forwarding information from trusted config, never client input.
      req.headers['x-forwarded-proto'] = authority.protocol.slice(0, -1);
      req.rawHeaders.push('x-forwarded-proto', req.headers['x-forwarded-proto']);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (authority.protocol === 'https:') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      if (url.pathname === '/healthz') {
        const disk = await statfs(storage.root);
        storage.sqlite.prepare('SELECT 1').get();
        const healthy = !stopping && disk.bavail * disk.bsize > 20 * 1024 * 1024;
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable' })); return;
      }
      if (config.redirectHosts.has(host) && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(308, { Location: config.origin + url.pathname + url.search, 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (host !== authority.host && !productHost) { res.writeHead(421, { 'Cache-Control': 'no-store' }); res.end('Unrecognized host'); return; }
      // Apply the boundary to encoded and trailing-slash route equivalents too.
      let routePath;
      try { routePath = decodeURIComponent(url.pathname).replace(/\/+$/, ''); }
      catch { res.writeHead(400); res.end(); return; }
      if ((productHost && host !== authority.host && !['www','app'].includes(host.slice(0,-domain.length-1))) || /^\/(?:p|f|r|invite|partners)(?:\/|$)/.test(routePath) || /^\/api\/(?:checkout|quote|connect\/stripe|referrals|invite|leads|visits|crm)(?:\/|$)/.test(routePath) || /^\/api\/products\/[^/]+\/slots(?:\/|$)/.test(routePath)) { res.writeHead(410,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'FiveGen is a private AI creation studio. Storefronts, seller payments, referrals and payouts are no longer available.'}));return; }
      if (routePath === '/api/webhooks/paddle' && process.env.PADDLE_ENVIRONMENT === 'production') {
        try { await allowPaddleWebhookSource(webhookSource, { mode: process.env.PADDLE_WEBHOOK_IP_MODE, render: process.env.RENDER === 'true' }); }
        catch (error) { res.writeHead(error.status === 403 ? 403 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(error.status === 403 ? {} : { 'Retry-After': '60' }) }); res.end(JSON.stringify({ error: error.status === 403 ? 'Webhook source IP is not allowed.' : 'Webhook IP verification is temporarily unavailable.' })); return; }
      }
      if (productHost && ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname)) {
        res.writeHead(303, { Location: config.origin + url.pathname + url.search }); res.end(); return;
      }
      if (await auth.handle(req, res, url)) return;
      // Authenticated responses must never enter an intermediary shared cache.
      if (req.headers['oai-authenticated-user-id']) res.setHeader('Cache-Control', 'private, no-store');
      for (const handler of handlers) handler.call(server, req, res);
    } catch {
      console.error('FiveGen could not handle a request.');
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Please try again shortly.' }));
    }
  });
  server.requestTimeout = 180000;
  server.headersTimeout = 30000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '0.0.0.0', resolve);
  });
  console.log(`FiveGen production server listening on port ${config.port}`);
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { storage.close(); process.exit(0); });
    server.closeIdleConnections();
    // Exit before Render's default 30-second limit for disk-backed services.
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 25000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return { server, storage };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch(error => { console.error('FiveGen startup failed:', error.message); process.exit(1); });
}
