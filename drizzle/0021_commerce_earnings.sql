ALTER TABLE `commerce_orders` ADD `expected_fee_bps` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `expected_fee_amount` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `earnings_checked_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `commerce_earnings` (
 `order_id` text PRIMARY KEY NOT NULL REFERENCES `commerce_orders`(`id`),
 `charge_id` text NOT NULL,
 `charge_application_fee_amount` integer NOT NULL,
 `refunded_amount` integer NOT NULL,
 `disputed` integer NOT NULL,
 `balance_transaction_id` text,
 `settlement_amount` integer,
 `settlement_currency` text,
 `stripe_fee_amount` integer,
 `platform_fee_amount` integer,
 `creator_net_amount` integer,
 `availability` text NOT NULL DEFAULT 'pending',
 `available_at` integer,
 `updated_at` integer NOT NULL
);
