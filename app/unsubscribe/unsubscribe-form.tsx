'use client';
import { useEffect, useState } from 'react';

export default function UnsubscribeForm() {
  const [token, setToken] = useState(''), [status, setStatus] = useState('loading'), [error, setError] = useState('');
  useEffect(() => { const value = window.location.hash.slice(1); window.history.replaceState(null, '', window.location.pathname); queueMicrotask(() => { setToken(value); setStatus(/^[a-f0-9]{64}$/.test(value) ? 'ready' : 'invalid'); }); }, []);
  async function unsubscribe() {
    setStatus('sending'); setError('');
    try { const response = await fetch('/api/automations/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || 'Please try again.'); setStatus('done'); } catch (reason) { setError((reason as Error).message); setStatus('ready'); }
  }
  return <section><span className="growth-eyebrow">FIVEGEN EMAIL PREFERENCES</span><h1>{status === 'done' ? 'You’re unsubscribed.' : 'Your inbox, your choice.'}</h1><p>{status === 'done' ? 'You will no longer receive marketing sequences from this creator. Essential purchase and access emails can still arrive.' : 'Unsubscribe from marketing emails across this creator’s products. Your purchases and access will stay available.'}</p>{error && <p role="alert">{error}</p>}{status === 'invalid' && <p>This link is unavailable. Open the full unsubscribe link from an email.</p>}{['ready', 'sending'].includes(status) && <button className="button primary" disabled={status === 'sending'} onClick={() => void unsubscribe()}>{status === 'sending' ? 'Updating…' : 'Unsubscribe'}</button>}</section>;
}
