import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const commerceAccounts = sqliteTable('commerce_accounts', {
  key: text('key').primaryKey(), owner: text('owner').notNull(), mode: text('mode').notNull(), accountId: text('account_id').notNull(),
  status: text('status').notNull().default('pending'), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('commerce_account_identity').on(t.mode, t.accountId), uniqueIndex('commerce_account_owner').on(t.owner,t.mode)]);
export const commerceOffers = sqliteTable('commerce_offers', {
  productId: text('product_id').primaryKey(), owner: text('owner').notNull(), enabled: integer('enabled').notNull().default(0), enabledMode: text('enabled_mode').notNull().default('test'),
  amount: integer('amount').notNull(), currency: text('currency').notNull().default('usd'),
  intakePrompt: text('intake_prompt').notNull().default(''), meetingUrl: text('meeting_url').notNull().default(''), updatedAt: integer('updated_at').notNull(),
});
export const commerceOrders = sqliteTable('commerce_orders', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(), accountId: text('account_id').notNull(), mode: text('mode').notNull(),
  email: text('email').notNull(), amount: integer('amount').notNull(), currency: text('currency').notNull(), title: text('title').notNull(), campaign: text('campaign').notNull().default(''),
  status: text('status').notNull().default('pending'), sessionId: text('session_id').unique(), paymentIntent: text('payment_intent'),
  expectedFeeBps: integer('expected_fee_bps').notNull().default(0), expectedFeeAmount: integer('expected_fee_amount').notNull().default(0),
  feePlanId: text('fee_plan_id').notNull().default('historical'),
  earningsCheckedAt: integer('earnings_checked_at').notNull().default(0),
  accessHash: text('access_hash').notNull(), createdAt: integer('created_at').notNull(), paidAt: integer('paid_at'),
}, t => [index('commerce_order_email').on(t.email,t.mode), index('commerce_order_owner').on(t.owner,t.mode,t.paidAt), uniqueIndex('commerce_payment').on(t.accountId,t.mode,t.paymentIntent)]);
export const commerceEarnings = sqliteTable('commerce_earnings', {
  orderId:text('order_id').primaryKey().references(()=>commerceOrders.id),chargeId:text('charge_id').notNull(),chargeApplicationFeeAmount:integer('charge_application_fee_amount').notNull(),refundedAmount:integer('refunded_amount').notNull(),disputed:integer('disputed').notNull(),
  balanceTransactionId:text('balance_transaction_id'),settlementAmount:integer('settlement_amount'),settlementCurrency:text('settlement_currency'),stripeFeeAmount:integer('stripe_fee_amount'),platformFeeAmount:integer('platform_fee_amount'),creatorNetAmount:integer('creator_net_amount'),
  availability:text('availability').notNull().default('pending'),availableAt:integer('available_at'),updatedAt:integer('updated_at').notNull(),
});
export const commerceRevocations = sqliteTable('commerce_revocations', {
  key: text('key').primaryKey(), accountId: text('account_id').notNull(), mode: text('mode').notNull(), paymentIntent: text('payment_intent').notNull(), reason: text('reason').notNull(), createdAt: integer('created_at').notNull(),
});
export const commerceEvents = sqliteTable('commerce_events', {
  id: text('id').primaryKey(), type: text('type').notNull(), createdAt: integer('created_at').notNull(),
});
export const commerceSlots = sqliteTable('commerce_slots', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(), startsAt: integer('starts_at').notNull(), endsAt: integer('ends_at').notNull(),
}, t => [uniqueIndex('commerce_slot_time').on(t.owner,t.startsAt),index('commerce_slot_product').on(t.productId,t.startsAt)]);
export const commerceBookings = sqliteTable('commerce_bookings', {
  id: text('id').primaryKey(), slotId: text('slot_id').notNull(), orderId: text('order_id').notNull(), owner: text('owner').notNull(), productId: text('product_id').notNull(), email: text('email').notNull(),
  mode: text('mode').notNull(), intake: text('intake').notNull(), status: text('status').notNull().default('confirmed'), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('commerce_booking_slot').on(t.slotId,t.mode).where(sql`${t.status} = 'confirmed'`),uniqueIndex('commerce_booking_order').on(t.orderId).where(sql`${t.status} = 'confirmed'`),index('commerce_booking_owner').on(t.owner,t.createdAt)]);
