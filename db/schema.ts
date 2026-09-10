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
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
export const checkoutIntents = sqliteTable("checkout_intents", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), productId: text("product_id").notNull(),
  account: text("account").notNull(), amount: integer("amount").notNull(), mode: text("mode").notNull(),
  items: text("items").notNull(), quantity: integer("quantity").notNull().default(1),
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
  updatedAt: integer("updated_at").notNull(),
});
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
