import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const authPaths = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']);
const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));

export function safeReturn(value) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  const url = new URL(value, 'https://fivegen.invalid');
  return url.origin === 'https://fivegen.invalid' && !authPaths.has(url.pathname)
    ? url.pathname + url.search + url.hash : '/';
}

export function stripHeaders(req, predicate) {
  for (const name of Object.keys(req.headers)) if (predicate(name)) delete req.headers[name];
  for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2)
    if (predicate(req.rawHeaders[i].toLowerCase())) req.rawHeaders.splice(i, 2);
}
function setHeader(req, name, value) {
  stripHeaders(req, candidate => candidate === name);
  req.headers[name] = value;
  req.rawHeaders.push(name, value);
}
function cookie(req, name) {
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export async function verifyGoogleToken(idToken, config, nonce, keys = GOOGLE_KEYS) {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: config.googleClientId,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp'],
    maxTokenAge: '10m',
    clockTolerance: 30,
  });
  if (!equal(payload.nonce, nonce) || payload.email_verified !== true ||
      (payload.azp && payload.azp !== config.googleClientId) ||
      typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub) ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
    throw new Error('Invalid Google identity');
  return { userId: 'google:' + payload.sub, email: payload.email.toLowerCase(), name: String(payload.name || payload.email).slice(0, 200) };
}
async function exchangeCode(code, verifier, config) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, code_verifier: verifier, grant_type: 'authorization_code',
      client_id: config.googleClientId, client_secret: config.googleClientSecret,
      redirect_uri: config.origin + '/callback' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Google sign-in exchange failed');
  const data = await response.json();
  if (typeof data.id_token !== 'string') throw new Error('Google returned no identity');
  return data.id_token;
}

export function createAuth(config, storage, { exchange = exchangeCode, verify = verifyGoogleToken } = {}) {
  const db = storage.sqlite;
  const secure = new URL(config.origin).protocol === 'https:';
  const sessionName = secure ? '__Host-fivegen-session' : 'fivegen-local-session';
  const flowName = secure ? '__Host-fivegen-flow' : 'fivegen-local-flow';
  const sessionSeconds = 30 * 24 * 3600;
  const makeCookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  let nextCleanup = 0;
  function cleanup() {
    const now = Date.now();
    if (now < nextCleanup) return;
    db.prepare('DELETE FROM render_auth_flows WHERE expires<?').run(now);
    db.prepare('DELETE FROM render_sessions WHERE expires<?').run(now);
    nextCleanup = now + 60000;
  }
  function attachIdentity(req) {
    // Sites identity headers are trusted ONLY after this boundary replaces them.
    // A copied local preview cookie must never grant a production identity.
    stripHeaders(req, name => name.startsWith('oai-authenticated-user-'));
    const value = cookie(req, sessionName);
    if (!value) return;
    const user = db.prepare('SELECT * FROM render_sessions WHERE hash=? AND expires>?').get(digest(value), Date.now());
    if (!user) return;
    setHeader(req, 'oai-authenticated-user-id', user.user_id);
    setHeader(req, 'oai-authenticated-user-email', user.email);
    setHeader(req, 'oai-authenticated-user-full-name', encodeURIComponent(user.name));
    setHeader(req, 'oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
  }
  function fail(res, status = 400) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Sign in · FiveGen</title><main style="max-width:420px;margin:15vh auto;padding:32px;font-family:system-ui;background:#151515;color:#fafafa;border-radius:24px"><h1>Let’s try signing in again.</h1><p>Your sign-in link may have expired. Return to FiveGen to start a new session.</p><a href="/signin-with-chatgpt" style="color:#ff7900">Continue with Google →</a></main>');
  }
  async function handle(req, res, url) {
    cleanup();
    attachIdentity(req);
    if (!authPaths.has(url.pathname)) return false;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.headers['next-router-prefetch'] || /prefetch/i.test(String(req.headers.purpose || req.headers['sec-purpose'] || ''))) {
      res.writeHead(204); res.end(); return true;
    }
    if (!['GET', ...(url.pathname === '/signout-with-chatgpt' ? ['POST'] : [])].includes(req.method)) {
      res.setHeader('Allow', url.pathname === '/signout-with-chatgpt' ? 'GET, POST' : 'GET');
      fail(res, 405); return true;
    }
    // Sign-in may follow an external MCP authorization redirect. State, nonce,
    // browser binding, and PKCE protect that GET; logout must be same-origin.
    if (url.pathname === '/signout-with-chatgpt' && ((req.headers.origin && req.headers.origin !== config.origin) || req.headers['sec-fetch-site'] === 'cross-site')) {
      fail(res, 403); return true;
    }
    try {
      if (url.pathname === '/signout-with-chatgpt') {
        const current = cookie(req, sessionName);
        if (current) db.prepare('DELETE FROM render_sessions WHERE hash=?').run(digest(current));
        res.setHeader('Set-Cookie', [makeCookie(sessionName, '', 0), makeCookie(flowName, '', 0)]);
        res.writeHead(303, { Location: safeReturn(url.searchParams.get('return_to')) }); res.end();
      } else if (url.pathname === '/signin-with-chatgpt') {
        // Bound pending state to one browser, and cap outstanding state growth.
        if (db.prepare('SELECT COUNT(*) n FROM render_auth_flows').get().n >= 10000) { fail(res, 429); return true; }
        const state = token(), browser = token(), verifier = token(), nonce = token();
        db.prepare('INSERT INTO render_auth_flows VALUES (?,?,?,?,?,?)')
          .run(digest(state), digest(browser), verifier, nonce, safeReturn(url.searchParams.get('return_to')), Date.now() + 600000);
        const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        target.search = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: config.origin + '/callback',
          response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: digest(verifier),
          code_challenge_method: 'S256', prompt: 'select_account' }).toString();
        res.setHeader('Set-Cookie', makeCookie(flowName, browser, 600));
        res.writeHead(302, { Location: target.href }); res.end();
      } else {
        const state = url.searchParams.get('state'), browser = cookie(req, flowName), code = url.searchParams.get('code');
        if (!state || state.length > 100 || !browser || !code || code.length > 4096) throw new Error('Missing authorization');
        const flow = db.prepare('DELETE FROM render_auth_flows WHERE hash=? AND browser_hash=? AND expires>? RETURNING *')
          .get(digest(state), digest(browser), Date.now());
        if (!flow) throw new Error('Invalid or expired authorization');
        const user = await verify(await exchange(code, flow.verifier, config), config, flow.nonce);
        const current = cookie(req, sessionName), session = token();
        if (current) db.prepare('DELETE FROM render_sessions WHERE hash=?').run(digest(current));
        db.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)')
          .run(digest(session), user.userId, user.email, user.name, Date.now() + sessionSeconds * 1000);
        res.setHeader('Set-Cookie', [makeCookie(sessionName, session, sessionSeconds), makeCookie(flowName, '', 0)]);
        res.writeHead(303, { Location: flow.return_to }); res.end();
      }
    } catch {
      // Never log the callback URL, authorization codes, tokens, or provider body.
      fail(res);
    }
    return true;
  }
  return { handle, attachIdentity, sessionName, flowName };
}
