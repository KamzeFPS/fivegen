export type SubscriptionAccessState = { status: string; scheduled_change_action?: string | null; scheduledChange?: unknown };

// Scheduled changes are informational; only the current status controls access.
// Past-due and paused subscriptions have no paid access until they recover.
export function subscriptionGrantsAccess(subscription: SubscriptionAccessState | null | undefined): boolean {
  return subscription?.status === 'active' || subscription?.status === 'trialing';
}

// Preserve sub-millisecond ordering from Paddle occurred_at timestamps.
export function eventTime(value: string): number {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error('Invalid Paddle event timestamp.');
  const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1] ?? '';
  return millis * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6));
}
