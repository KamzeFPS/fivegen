# Products, delivery, funnels, and partners

FiveGen supports guides, courses, template kits, challenges, playbooks, custom resources, coaching sessions, and communities. The brief asks for a concrete customer outcome and an optional differentiating angle. Each format has a different generation architecture. Challenges support 3–30 days; courses separate learning objectives, practice, and assessment; templates and custom tools must contain usable files. Originality and commercial success are not guaranteed. Review generated content and code before selling it.

## Creator workflow

1. Choose a format and write the brief. AI needs the administrator's shared OpenAI/Anthropic configuration; manual drafts are explicitly empty.
2. Build the product. Edit, reorder, add, or remove units; edit generated supporting files in Product files. Moving to the next setup step saves changes first.
3. Configure Delivery. All products have a member space and downloadable written resources. Pro adds video uploads, private discussions, and bookings. Videos must be MP4/WebM, up to 100 MB each; uploads have a 2 GB workspace allowance. Long recordings should be split into lessons. This is private file streaming with range requests, not video transcoding or adaptive streaming.
4. Configure the storefront and sales funnel. Publish checks reject empty content, template kits without files, coaching without bookings/a meeting link, and communities without a member community.
5. Publish and share the product or funnel link. Google-verified purchase email unlocks the member space; the opaque purchase link still unlocks downloads. Keep access links private.

Customer ZIPs exclude the creator's launch campaign and marketing prompts. Resource filenames remain unchanged so HTML/CSS/JS references work after extraction. Member completion is stored against stable lesson IDs. Existing purchases retain access when a creator takes the storefront off sale, subject to subscription access checks.

## Funnels and booking

Pro includes five editable starting layouts: sales, VSL, free guide, booking, and post-booking. Presets can be undone; section order, copy, colors, typography, layout, CTA, and supported media remain editable. A VSL must have a video before publishing. Uploaded sales video is public only while its published funnel is enabled and the owner has Pro.

A free-guide funnel can deliver the same free product or another published free product owned by the creator. Names and emails become CRM leads. Marketing consent is separate, optional, and initially unchecked; providing an email for access does not grant marketing permission.

Customers reserve creator-supplied times after acquiring a booking product. Each paid purchase or paid renewal provides one session; a free product provides one introductory session. A future appointment can be cancelled and rebooked. A completed or missed session uses its allowance; a new paid purchase provides another. Only one upcoming appointment can be held at a time. Overlapping appointments across the creator's products are rejected. Calendar downloads, preparation instructions, meeting links, and an optional preparation video appear in the confirmation. Attendance is recorded by the creator after the scheduled start.

CRM shows captured leads, bookings, recorded attendance, and gross paid sales. Booking rate is captured product leads with a non-cancelled booking divided by captured leads in the selected period. Show-up rate is attended divided by attended plus no-show; future/unmarked appointments are excluded. Sales are gross, before refunds, platform fees, partner shares, and Stripe processing. Tables/CSV contain up to 1,000 records; headline metrics cover the full selected period.

## Referral agreement

Pro creators invite a partner by email with a 1–80% commission (stored to hundredths of a percent). The partner must accept using that verified email. Partners can receive commissions on a Free account, after connecting an eligible Stripe account.

- The agreed percentage applies to this product's discounted paid price, excluding add-ons. Only the customer's first paid purchase of the product qualifies; subscription renewals and self-referrals do not.
- Accepted partners get a unique `/r/…` URL. The last visited partner link for that product is remembered for 30 days in an HttpOnly cookie. It is browser-specific, not cross-device attribution.
- Invitations expire after 14 days. A pending invitation can be replaced from Partners; its previous link stops working. To change an accepted percentage, revoke the agreement and send a new one. Revoking stops future attribution and does not erase earned commissions.
- FiveGen's normal platform fee and the reserved partner share are collected together through a Stripe Connect application fee. The first subscription payment reserves the partner share; subsequent invoices use only FiveGen's current plan commission.
- Eligible earnings can be claimed after a 14-day hold. A claim transfers funds from the platform balance to the partner's Stripe account; Stripe controls subsequent bank payout timing. Transfers require a supported account/country and sufficient platform balance.
- A refund, including a partial refund, or a dispute cancels the entire referral commission. Previously transferred shares are reversed before returning the reserved application-fee portion to the seller. Stripe can reject reversals if funds are unavailable; failed events must be retried and reconciled. Keep a platform reserve for these obligations.
- Claims and reversals use Stripe idempotency and persisted state. An uncertain transfer is searched by its commission group before a retry. Unresolved attempts beyond 20 hours require administrator reconciliation; never issue an extra manual payout without checking Stripe first.

The percentage is a sales commission, not ownership or equity in a product. Free stays at 10 products and a 10% platform fee; Pro retains its 3% platform fee, with the partner share additional to it. AI/media credits and billing behavior are unchanged.

## Resend configuration

The super administrator connects Resend in AI & credits → platform settings, with an API key and a verified sender email. Alternatively set `RESEND_API_KEY` and `EMAIL_FROM` on the server. Secrets are encrypted when stored in the admin connection and never returned to customers. See [Resend sender documentation](https://resend.com/docs/api-reference/emails/send-email).

Without Resend, invitations provide a copyable link and booking confirmation stays available in the member space. The app does not claim an email was sent. With a valid connection, user-triggered invitations and booking confirmations use Resend with idempotency keys. This connection does not run marketing campaigns.

## Deployment and checks

Append-only migration `0005_loose_madripoor.sql` creates the customer journey records and extends products/providers/checkout intents. Render applies it at startup. Keep the existing database, disk, and credential encryption key.

Enable these events on the **connected-account sales** Stripe destination: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.created`, `invoice.paid`, `charge.refunded`, and `charge.dispute.created`. The platform billing destination keeps its separate existing events. See [Stripe direct charges and application fees](https://docs.stripe.com/connect/direct-charges?platform=web&ui=elements).

After `npm run build:render`, run `npm run test:render:integration`, `npm run test:journey`, `npm run test:referrals`, and the commission/commerce/credit checks. Journey tests use isolated local accounts and a temporary production database. Financial tests replace only the Stripe transport, exercise the real commission code/SQL, and move no money. These checks do not establish live provider quality or successful live payouts.
