-- Private planning only. This table cannot activate invitations, commissions or payouts.
CREATE TABLE partner_pilot_proposals (
 owner TEXT PRIMARY KEY NOT NULL,
 draft TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE partner_pilot_proposal_events (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 actor TEXT NOT NULL,
 revision INTEGER NOT NULL,
 action TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(owner,revision)
);
