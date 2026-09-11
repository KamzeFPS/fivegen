import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const mcpClients = sqliteTable("mcp_clients", {
  id:text("id").primaryKey(),name:text("name").notNull(),redirects:text("redirects").notNull(),createdAt:integer("created_at").notNull(),
});
export const mcpCodes = sqliteTable("mcp_codes", {
  hash:text("hash").primaryKey(),clientId:text("client_id").notNull(),owner:text("owner").notNull(),redirect:text("redirect").notNull(),challenge:text("challenge").notNull(),scopes:text("scopes").notNull(),resource:text("resource").notNull(),expires:integer("expires").notNull(),used:integer("used").notNull().default(0),
});
export const mcpConnections = sqliteTable("mcp_connections", {
  id:text("id").primaryKey(),owner:text("owner").notNull(),clientId:text("client_id").notNull(),name:text("name").notNull(),scopes:text("scopes").notNull(),resource:text("resource").notNull(),accessHash:text("access_hash").notNull().unique(),refreshHash:text("refresh_hash").notNull().unique(),accessExpires:integer("access_expires").notNull(),refreshExpires:integer("refresh_expires").notNull(),revoked:integer("revoked").notNull().default(0),createdAt:integer("created_at").notNull(),lastUsedAt:integer("last_used_at").notNull(),
},t=>[index("idx_mcp_connections_owner").on(t.owner)]);
export const mcpCalls = sqliteTable("mcp_calls", {
  id:text("id").primaryKey(),owner:text("owner").notNull(),connectionId:text("connection_id").notNull(),tool:text("tool").notNull(),fingerprint:text("fingerprint").notNull(),state:text("state").notNull(),result:text("result"),createdAt:integer("created_at").notNull(),
},t=>[index("idx_mcp_calls_owner").on(t.owner,t.createdAt)]);
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    audience: text("audience").notNull(),
    format: text("format").notNull(),
    price: integer("price").notNull().default(0),
    color: text("color").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("draft"),
    commerce: text("commerce").notNull().default("{}"),
    experience: text("experience").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_products_owner").on(t.owner)],
);
export const sellers = sqliteTable("sellers", {
  owner: text("owner").primaryKey(),
  name: text("name").notNull().default("My studio"),
  stripeAccount: text("stripe_account"),
  createdAt: integer("created_at").notNull(),
});
export const memberships = sqliteTable("memberships", {
  owner: text("owner").primaryKey(),
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id").unique(),
  status: text("status").notNull().default("free"),
  interval: text("interval"),
  periodEnd: integer("period_end"),
  periodStart: integer("period_start"),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
export const checkoutIntents = sqliteTable("checkout_intents", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), productId: text("product_id").notNull(),
  account: text("account").notNull(), amount: integer("amount").notNull(), mode: text("mode").notNull(),
  items: text("items").notNull(), quantity: integer("quantity").notNull().default(1),
  platformFee: integer("platform_fee").notNull().default(0),
  sessionId: text("session_id").unique(), createdAt: integer("created_at").notNull(),
  referralId: text("referral_id"), referralFee: integer("referral_fee").notNull().default(0),
  email: text("email").notNull().default(""),
});
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    owner: text("owner").notNull(),
    email: text("email").notNull(),
    amount: integer("amount").notNull(),
    platformFee: integer("platform_fee").notNull().default(0),
    provider: text("provider").notNull(),
    token: text("token").notNull().unique(),
    items: text("items").notNull().default("[]"),
    subscriptionId: text("subscription_id"),
    customerId: text("customer_id"),
    stripeAccount: text("stripe_account"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_orders_owner_date").on(t.owner, t.createdAt)],
);
export const visits = sqliteTable(
  "visits",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    owner: text("owner").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_visits_owner_date").on(t.owner, t.createdAt)],
);
export const providers = sqliteTable("providers", {
  owner: text("owner").primaryKey(),
  openai: text("openai"),
  anthropic: text("anthropic"),
  fal: text("fal"),
  resend: text("resend"),
  config: text("config").notNull().default("{}"),
});
export const generation = sqliteTable("generation", {
  productId: text("product_id").primaryKey(),
  owner: text("owner").notNull(),
  brief: text("brief").notNull(),
  stage: integer("stage").notNull().default(-1),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  lease: integer("lease").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
export const wallets=sqliteTable("wallets",{
  owner:text("owner").primaryKey(),starter:integer("starter").notNull().default(1200),included:integer("included").notNull().default(0),purchased:integer("purchased").notNull().default(0),cycle:text("cycle").notNull().default(""),expires:integer("expires").notNull().default(0),
});
export const creditUsage=sqliteTable("credit_usage",{
  id:text("id").primaryKey(),owner:text("owner").notNull(),operation:text("operation").notNull(),cost:integer("cost").notNull(),state:text("state").notNull(),starterUsed:integer("starter_used").notNull(),includedUsed:integer("included_used").notNull(),purchasedUsed:integer("purchased_used").notNull(),cycle:text("cycle").notNull(),createdAt:integer("created_at").notNull(),
},t=>[index("idx_credit_usage_owner_date").on(t.owner,t.createdAt)]);
export const creditPurchases=sqliteTable("credit_purchases",{
  id:text("id").primaryKey(),owner:text("owner").notNull(),credits:integer("credits").notNull(),amount:integer("amount").notNull(),paymentIntent:text("payment_intent"),state:text("state").notNull().default("pending"),reversed:integer("reversed").notNull().default(0),createdAt:integer("created_at").notNull(),
});
export const platformReceipts=sqliteTable("platform_receipts",{id:text("id").primaryKey(),owner:text("owner").notNull(),amount:integer("amount").notNull(),createdAt:integer("created_at").notNull()});
export const aiBudget=sqliteTable("ai_budget",{day:text("day").primaryKey(),reservedMicros:integer("reserved_micros").notNull().default(0)});
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    productId: text("product_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    status: text("status").notNull(),
    remote: text("remote"),
    objectKey: text("object_key"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_assets_product_owner").on(t.productId, t.owner)],
);

export const uploads = sqliteTable("uploads", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),productId:text("product_id").notNull(),name:text("name").notNull(),mime:text("mime").notNull(),size:integer("size").notNull(),objectKey:text("object_key").notNull(),status:text("status").notNull().default("uploading"),createdAt:integer("created_at").notNull(),
},t=>[index("idx_uploads_owner").on(t.owner),index("idx_uploads_product").on(t.productId)]);
export const leads = sqliteTable("leads", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),productId:text("product_id").notNull(),email:text("email").notNull(),name:text("name").notNull(),marketing:integer("marketing").notNull().default(0),source:text("source").notNull(),createdAt:integer("created_at").notNull(),
},t=>[index("idx_leads_owner_date").on(t.owner,t.createdAt)]);
export const bookingSlots = sqliteTable("booking_slots", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),productId:text("product_id").notNull(),startsAt:integer("starts_at").notNull(),duration:integer("duration").notNull(),bookingId:text("booking_id"),
},t=>[index("idx_slots_product_date").on(t.productId,t.startsAt)]);
export const bookings = sqliteTable("bookings", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),productId:text("product_id").notNull(),slotId:text("slot_id").notNull(),userId:text("user_id").notNull(),email:text("email").notNull(),name:text("name").notNull(),status:text("status").notNull().default("confirmed"),notes:text("notes").notNull().default(""),createdAt:integer("created_at").notNull(),
},t=>[index("idx_bookings_owner").on(t.owner),index("idx_bookings_user").on(t.userId,t.productId)]);
export const lessonProgress = sqliteTable("lesson_progress", {
 id:text("id").primaryKey(),productId:text("product_id").notNull(),userId:text("user_id").notNull(),lessonId:text("lesson_id").notNull(),completedAt:integer("completed_at").notNull(),
},t=>[index("idx_progress_user_product").on(t.userId,t.productId)]);
export const communityPosts = sqliteTable("community_posts", {
 id:text("id").primaryKey(),productId:text("product_id").notNull(),userId:text("user_id").notNull(),name:text("name").notNull(),body:text("body").notNull(),parentId:text("parent_id"),pinned:integer("pinned").notNull().default(0),createdAt:integer("created_at").notNull(),
},t=>[index("idx_posts_product_date").on(t.productId,t.createdAt)]);
export const referralInvites = sqliteTable("referral_invites", {
 id:text("id").primaryKey(),owner:text("owner").notNull(),productId:text("product_id").notNull(),email:text("email").notNull(),percent:integer("percent").notNull(),code:text("code").notNull().unique(),tokenHash:text("token_hash").notNull().unique(),userId:text("user_id"),status:text("status").notNull().default("pending"),expiresAt:integer("expires_at").notNull(),createdAt:integer("created_at").notNull(),
},t=>[index("idx_referrals_owner").on(t.owner),index("idx_referrals_user").on(t.userId)]);
export const referralCommissions = sqliteTable("referral_commissions", {
 id:text("id").primaryKey(),orderId:text("order_id").notNull().unique(),inviteId:text("invite_id").notNull(),owner:text("owner").notNull(),partner:text("partner").notNull(),productId:text("product_id").notNull(),amount:integer("amount").notNull(),percent:integer("percent").notNull(),account:text("account").notNull(),paymentIntent:text("payment_intent").notNull(),state:text("state").notNull().default("pending"),availableAt:integer("available_at").notNull(),transferId:text("transfer_id"),payoutStartedAt:integer("payout_started_at"),createdAt:integer("created_at").notNull(),
},t=>[index("idx_commissions_partner").on(t.partner,t.createdAt),index("idx_commissions_owner").on(t.owner,t.createdAt),index("idx_commissions_payment").on(t.account,t.paymentIntent)]);
