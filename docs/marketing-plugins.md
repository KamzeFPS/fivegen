# Product marketing workspace

Marketing opens Growth plan (`/?project={id}&area=dashboard`) and groups work into **Plan**, **Create**, **Follow up** and **Results**. Plan contains Growth plan, Funnel Builder, offer research and creator references. Create contains Sales video, Lead capture and Campaigns. Follow up opens Emails. The current group shows its relevant visible tools instead of wrapping every tool into one long tab row. Saved shortcut preferences remain authoritative. Growth plan keeps the existing goal checklist and review queue; Results holds observed product/campaign evidence, the business-wide Dashboard remains separate, and Customers owns CRM.

**Your product brief · reused here** is a compact common reference in the marketing tools. Blank audience, useful outcome, tone and inclusions inherit saved product facts; the outcome comes from `fields.outcome`, never the description. Nonblank shared answers remain explicit overrides. The editor identifies inherited/shared values and offers a return to the originating product tool. Opening inherited defaults does not require saving an untouched draft. Updating the common brief preserves existing scripts, campaign items, page drafts, checkout terms and approved/enrolled email snapshots.

Emails foregrounds the reviewed journey and copy. **Sender, page & activation checklist** groups sender details, destination and readiness in a disclosure that opens when needed. Results foregrounds the recorded journey and next action, with **Share-link performance** and **Business metrics & earnings** in disclosures. The underlying consent, approval, reporting scope and provider-status semantics are unchanged.

The tools have distinct roles:

- **Funnel Builder** (`funnel-builder`) maps the private strategy and handoffs around an offer. It is separate from the page editor; graph connections never publish, send, charge or grant access.
- **Sales video** (`vsl`) prepares creator-authored script and recording work.
- **Lead capture** (`funnel`, the retained compatibility ID) manages signup/application pages and their explicit consent choices. Sales page remains the public offer editor.
- **Campaigns** (`campaigns`) prepares promotional copy and manual publishing reminders.
- **Emails** (`automations`) reviews recipient rules and explicitly approved delivery.
- **Test my offer** (`offer`) gathers positioning feedback without changing commercial terms.
- **Creator references** (`voice`) selects approved private sources for the current product; reusable material lives in Creator library.

Funnel Builder is a visible shortcut when a product has never saved navigation preferences. Any saved preference row, including an empty list, remains authoritative; updates never silently reveal a tool that the creator previously hid. A direct tool link opens the workspace without changing its shortcut preference. Customize visible tools changes navigation only.

`GET/PATCH /api/products/{id}/marketing-plugins` reads or changes `{installed,updatedAt}`. Mutations require authenticated ownership, same-origin requests, strict IDs and optimistic concurrency through `expectedUpdatedAt`. Preference changes do not alter product content, strategy graphs, pages, customer records or active delivery. Hiding a tool neither deletes its saved work nor pauses a published page or email sequence; manage running work in its owning tool.

Unified builders and file-sale editors use the same Marketing workspace. Authenticated `/build/{id}?area=funnel-builder` links normalize to the canonical Marketing address; returning to Content resumes the correct product editor. Dirty/busy child panels participate in the shared save registry and navigation guard. Saving drafts never activates a sequence or publishes a page.

## Strategy Canvas and private scheduling

Funnel Builder keeps the selected Strategy Canvas layout. Audience context leads into **Get discovered**, **Build trust** and **Convert**. Selecting a stage reveals its proposed hooks, recording outlines, metrics and experiments. These are hypotheses to review, not observed platform analytics or predicted conversion results. The graph, interview and stage strategy remain product-scoped; other tools continue to own pages, actual campaign assets, email delivery and customer records.

A creator can schedule a reviewed idea or action by explicitly choosing a planning account and date. That action creates a private calendar item with source references. Adding a graph connection does not schedule work, and scheduling does not publish to a social network, enroll an email recipient, reserve a service booking or change a product. A manual completion mark is the creator's record of their work, not verified publication or delivery.

## Global Calendar

Calendar opens at `/?view=calendar` from the shared workspace navigation and search. It works across products, with Month and Agenda views, date navigation, product/account/campaign filters, a display time zone and a way to show cancelled items. Account profiles hold a platform, handle or name, color and IANA time zone for organizing plans. They are manually managed planning identities: no social OAuth, external posting authorization or analytics connection is established.

Calendar links retain `calendarDate=YYYY-MM-DD`, `calendarAccount={ownedProfileId|unassigned}`, `calendarProduct={productId}`, `calendarCampaign={ownedCampaignId}`, `calendarView=month|agenda` and `calendarZone={IanaZone}` when selected. **Open shared Calendar** in Campaigns opens this same global view with its campaign and product selected. There is no separate campaign calendar. The date is a civil date in the chosen display zone. Agenda covers the current month; Month view also exposes the selected day's agenda. These keys filter the global view and do not use `project`, which opens a product editor. Imported items use their server-provided source link.

Manual items can be created, edited, marked done, cancelled and restored. Cancellation retains the private record. Timed items refer to an actual instant; changing the displayed time zone does not reschedule them. All-day plans use local dates with an exclusive end boundary. A one-day Monday plan ends at Tuesday's local midnight rather than at an invented fixed 24-hour UTC duration.

The Calendar also projects existing dated records without taking over their execution:

- `marketing_campaigns.items[].scheduledAt` provides **manual publishing reminders**, scoped by campaign and item identity. Each item has an optional Planning account and explicit reminder time zone; assigned reminders appear under that owned profile, and general reminders remain unassigned. Review the printed zone, choose **Reminder set · publish manually**, then save. Changing profiles retains an existing instant while changing its displayed local time, so creators must recheck the date. An email asset's reminder is not an enrolled email send. `creator_campaigns` is a retained compatibility backup and must not be imported a second time.
- `automation_jobs` joined to its owner/product-matching enrollment and sequence provides queued or recorded **Email activity**. Copy comes from the enrolled snapshot. A due time is dispatch or retry eligibility, not a promise of exact sending or inbox delivery; paused sequences remain visibly paused.
- `product_service_sessions` and legacy `commerce_bookings` joined to their owned paid orders and slots provide **service bookings**, with payment mode and cancellation state retained. Unbooked availability is not a confirmed appointment.
- Current published `product_builder_publications.content_snapshot.studio.community.events` provides **community event definitions** when the published community or challenge group feed is enabled. These are not attendance records, and existing members may retain their purchased content snapshot. Draft, archived or unpublished definitions are not imported.

Imported source items are read-only in Calendar. **Open source** returns to the owning Campaigns, Emails or customer workspace. Changing or cancelling a manual plan does not pause an email sequence, cancel a booking, refund a purchase or remove a published post. Reading Calendar must not reconcile queues, enroll people or dispatch workers.

Calendar data is private and owner-scoped. `GET /api/calendar?startAt={epochMs}&endAt={epochMs}` reads a bounded UTC interval of at most 93 days and accepts an owned `campaignId` filter. `/api/calendar/accounts` manages planning profiles; `/api/calendar/events` creates manual items with a request ID and updates them with the expected saved revision. Source timestamps retain their original semantics; no undated graph or client action item is assigned a fabricated deadline.

The [Funnel Builder guide](https://docs.fivegen.ai/marketing/funnel-builder) explains strategy, factual inputs, review, execution handoffs and measurement boundaries. The [Calendar guide](https://docs.fivegen.ai/workspace/calendar) explains planning profiles, date handling and source statuses. Local verification covers preference APIs, saved-hidden behavior, separate module mounting, route/auth preservation, keyboard tab selection and save guards. Provider generation, external account authorization, actual delivery and deployment checks remain separate.
