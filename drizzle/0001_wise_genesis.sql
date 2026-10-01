ALTER TABLE `orders` ADD `payment_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `inventory_released` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_gateway` ON `orders` (`gateway_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_payment` ON `orders` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_order_expiry` ON `orders` (`payment_status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `refunds` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `last_error` text;--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_order_id_unique` ON `refunds` (`order_id`);