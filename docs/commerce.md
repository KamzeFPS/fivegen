# Plans, offers, and funnels

FiveGen Free supports 10 products, including drafts, standard product pages, exports, Stripe selling, and the revenue dashboard. AI uses admin-managed OpenAI/Anthropic and fal.ai credentials. Customer-owned API keys are no longer read. FiveGen Pro costs USD 29/month or USD 290/year and supports 100 products plus deals, opt-in upsells, funnel pages, and recurring product prices. FiveGen collects 10% on Free sales and 3% on Pro sales; Stripe processing fees are separate. Pro includes 1,000 monthly credits. See monetization.md for full credit and cost rules.

The server enforces entitlements and the creation limit, including simultaneous requests. Downgrades preserve products and purchased access, pause deals and funnels, block new recurring sales, and apply the Free creation limit. Existing customer subscriptions continue in Stripe.

## Offers

- Percentage off, fixed amount off, BOGO, bundle price, free bonus, volume discount, early-bird discount, and limited-time sales.
- Optional promotion codes, start times, and end times; early-bird and limited-time sales require an end time.
- BOGO and bonuses include a distinct, published, one-time product belonging to the same creator. Bundles contain the main product and one selected product. Digital copies are not treated as distinct bonus products.
- One optional upsell, explicitly selected by the buyer. It cannot duplicate an included product.
- Monthly or yearly recurring products do not combine deals or upsells. Subscriptions unlock downloads while active. Already downloaded files remain with the buyer.
- Prices are calculated in integer cents on the server. Checkout revalidates the displayed total. Order contents are snapshotted, so delivery follows what was purchased even after an offer changes.
- Arbitrary Whop links are disabled until commission-aware payments are integrated. Stripe collects the platform commission automatically.

## Funnel editor

Each product can publish a funnel at `/f/[slug]`, alongside its standard `/p/[slug]` page. Creators can add, reorder, hide, delete, and edit up to 20 sections: hero, text, benefits, image, video, testimonial, FAQ, and checkout. Colors, typography, width, corners, alignment, headings, body copy, media URLs, and CTA labels are editable with a live preview. Exactly one visible checkout section is required. Video sections accept hosted HTTPS video files; arbitrary HTML/scripts are not accepted.

## Stripe configuration

Keep credentials in runtime secrets, never source control. Use test-mode credentials first.

1. Configure `STRIPE_SECRET_KEY` and the existing Stripe Connect client settings for creator payments.
2. Add a connected-account webhook destination at `/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.created`, and `invoice.paid`. Store its signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Add a platform-account webhook destination at the same URL for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`. Store this signing secret separately as `STRIPE_BILLING_WEBHOOK_SECRET`.
4. Enable and configure Stripe's customer portal for subscription management and cancellation on the platform account and connected accounts that sell subscriptions.
5. Pro billing uses server-defined inline recurring prices. It does not require manually created Stripe price IDs. Pro checkout remains unavailable until both the platform key and billing webhook secret exist.

Before accepting real money, exercise test-mode upgrade, renewal, failed payment, cancellation, portal access, creator subscription checkout, delayed checkout confirmation, and customer downloads. No real charges or provider generations were made during this implementation. These external payment flows require configured Stripe accounts and webhooks and have not been tested live.

Stripe references: [Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), and [customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal).

## Verification

- `node --experimental-strip-types scripts/commerce-test.mjs` checks price calculations, deal windows, codes, quantities, upsells, and subscription/funnel validation.
- Start the local dev server, apply local migrations, then run `node scripts/commerce-integration-test.mjs`. This uses isolated local fixtures and restores local membership data; it never grants production entitlements. It checks Free/Pro authorization, concurrent product limits, ownership, quote privacy, subscription rules, price revalidation, free-offer delivery, download token scope, and downgrades.
- Browser walkthrough covered plan selection, offer editing, funnel sections and preview, saved public pages, explicit upsell selection, and 390px mobile layouts without horizontal overflow. Temporary test products were removed afterward.

The site's existing audience settings still govern shared links. Publishing a product or funnel does not make a private FiveGen deployment public.
