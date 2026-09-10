import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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
    whopUrl: text("whop_url"),
    commerce: text("commerce").notNull().default("{}"),
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
