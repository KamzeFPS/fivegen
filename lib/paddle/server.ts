import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { ApiError, binding } from '../server';

export function paddleEnvironment(): 'sandbox' | 'production' {
  const environment = binding('PADDLE_ENVIRONMENT').trim();
  if (environment !== 'sandbox' && environment !== 'production') throw new ApiError('Set PADDLE_ENVIRONMENT explicitly to sandbox or production.', 503);
  return environment;
}

export function paddleServer() {
  const environment = paddleEnvironment();
  const apiKey = binding('PADDLE_API_KEY').trim();
  const prefix = environment === 'sandbox' ? 'pdl_sdbx_apikey_' : 'pdl_live_apikey_';
  if (!apiKey.startsWith(prefix)) throw new ApiError('Paddle server credentials are not configured for this environment.', 503);
  return new Paddle(apiKey, { environment: environment === 'sandbox' ? Environment.sandbox : Environment.production });
}

export function paddleSigningSecret() {
  const secret = binding('PADDLE_WEBHOOK_SECRET').trim();
  if (!secret || secret.startsWith('ntfset_') || /^pdl_(sdbx|live)_apikey_/.test(secret)) throw new ApiError('Paddle notification signing secret is not configured.', 503);
  return secret;
}

export function assertPaddleCheckoutReleased() {
  if (paddleEnvironment() === 'production' && binding('PADDLE_LIVE_RELEASE') !== 'approved') throw new ApiError('Live checkout is awaiting Paddle verification and website approval.', 503);
}
