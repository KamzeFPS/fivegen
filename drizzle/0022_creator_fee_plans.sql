ALTER TABLE `commerce_orders` ADD `fee_plan_id` text NOT NULL DEFAULT 'historical';
--> statement-breakpoint
ALTER TABLE `wallet_checkout_intents` ADD `checkout_name` text;
--> statement-breakpoint
CREATE INDEX `idx_wallet_charge_payment` ON `wallet_charge_state` (`environment`,`payment_intent`);
