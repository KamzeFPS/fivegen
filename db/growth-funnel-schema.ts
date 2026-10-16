import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Public copy is an explicit snapshot, separate from private creator work.
export const growthFunnels = sqliteTable("growth_funnels", {
  productId: text("product_id").primaryKey(),
  owner: text("owner").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  landing: text("landing").notNull(),
  creatorVslUploadId: text("creator_vsl_upload_id"),
  publishedAt: integer("published_at"),
  updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_growth_funnels_owner").on(t.owner)]);

export const growthLeads = sqliteTable("growth_leads", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  productId: text("product_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  marketing: integer("marketing").notNull().default(0),
  consentText: text("consent_text").notNull().default(""),
  consentAt: integer("consent_at"),
  source: text("source").notNull(),
  lastSource: text("last_source").notNull(),
  status: text("status").notNull().default("new"),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [
  uniqueIndex("idx_growth_leads_product_email").on(t.productId, t.email),
  index("idx_growth_leads_owner_date").on(t.owner, t.createdAt),
]);

export const growthLeadRateLimits = sqliteTable("growth_lead_rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_growth_lead_rate_expiry").on(t.expiresAt)]);
