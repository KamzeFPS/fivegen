# Service calendar, meetings and browser reminders

The implementation and local mock-provider tests are complete. Google and Zoom still require registered OAuth applications and an actual creator authorization before their live APIs can be verified. No provider credentials, live authorizations or deployment are created by the test suite.

## Google Calendar and Meet

Enable Google Calendar API for a Web application OAuth client. Configure `GOOGLE_SERVICE_CLIENT_ID` and `GOOGLE_SERVICE_CLIENT_SECRET` on the server; existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are fallbacks. Register the exact callback `${APP_ORIGIN}/api/service-integrations/google/callback`, such as `https://fivegen.ai/api/service-integrations/google/callback`. A localhost OAuth client must also explicitly allow its localhost callback.

The creator connects their own account in the service settings. Consent requests only `https://www.googleapis.com/auth/calendar.events.owned` and `https://www.googleapis.com/auth/calendar.events.freebusy`, with offline access. The connector checks primary-calendar busy periods, creates private events on that primary calendar, and optionally requests Google Meet conferencing. Google app consent verification and the creator's Meet eligibility are provider requirements. Event titles and descriptions contain generic session information; private intake, buyer email and client notes are not copied into Google.

Source: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [free/busy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event creation and conference data](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Zoom

Create a user-managed OAuth app and configure `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`. Register `${APP_ORIGIN}/api/service-integrations/zoom/callback`, including `https://fivegen.ai/api/service-integrations/zoom/callback` for that deployment. Register the confidential OAuth redirect and PKCE support as required by the Zoom app configuration. Localhost mocks do not establish that a live Zoom app accepts its development redirect.

Configure these own-user granular scopes: `meeting:write:meeting`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:update:meeting`, `meeting:delete:meeting`. Account-admin, recordings, profile and contact scopes are not requested. Only the participant join link is retained for buyer use; the host start URL is not stored or returned.

Source: [Zoom OAuth](https://developers.zoom.us/docs/integrations/oauth/), [granular scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/), [meetings API](https://developers.zoom.us/docs/api/meetings/).

## Persistence and delivery

Keep `APP_ORIGIN` canonical and keep `CREDENTIAL_ENCRYPTION_KEY` stable, at least 32 characters. OAuth tokens, refresh credentials, PKCE verifiers, push capability URLs and VAPID private keys are AES-GCM encrypted, with purpose and owner binding. OAuth state is single-use, expires in ten minutes, and also requires the initiating creator and HttpOnly browser nonce. Provider access refreshes server-side; disconnect removes local credentials immediately and attempts provider revocation.

Migrations `0033_service_integrations.sql` and `0034_product_push.sql` add the durable connection, synchronization and push ledgers. The runtime worker calls `/api/service-integrations/dispatch` with its private `PRODUCT_REMINDER_DISPATCH_SECRET`. Booking, rescheduling and cancellation enqueue persistent revisions. Google uses deterministic event IDs. Zoom reconciles a unique session topic after an ambiguous create; it never blindly retries a second create. A cancellation or refund is reconciled even when a previous external event was already synced. Errors remain visible in the buyer's client space and can be retried from creator connection settings.

External calendar and meeting changes are disabled for test-mode purchases. Publishing and selling a service configured for Google/Zoom still requires its local setup and connection checks to pass. Manual links and Jitsi remain available without an OAuth connection.

## Browser reminders

VAPID keys generate once automatically into encrypted persistent storage. A complete explicit `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` pair overrides the stored pair. `WEB_PUSH_SUBJECT` is optional; the HTTPS application origin is the default contact URL. Preserve the database and encryption key across restarts. Rotating a VAPID identity requires browser re-subscription.

Buyers enable notifications through an explicit button and browser permission prompt. Opt-in is per purchase and per browser, independently of email reminders. A supported secure context and active service worker are required; device/browser restrictions still apply. Subscriptions accept only supported public browser push-service hosts. Notifications contain generic text and open only a protected same-origin customer URL. Expired push endpoints disable themselves on HTTP 404/410; opt-out and revoked purchases cancel pending delivery. Topic/tag coalescing prevents duplicate visible notifications during retries.

Source: [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [web-push implementation](https://github.com/web-push-libs/web-push).

Run `node scripts/service-integrations-test.mjs` for the local protocol/security integration suite. It uses the production SQLite migrations, mock Google/Zoom responses, actual offline Web Push request encryption and a service-worker execution fixture; it makes no live provider calls.
