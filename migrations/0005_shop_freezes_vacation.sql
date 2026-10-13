CREATE TABLE `freezes_used` (
	`habit_id` text NOT NULL,
	`period_start` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`habit_id`, `period_start`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `freezes_used_inventory_item_id_unique` ON `freezes_used` (`inventory_item_id`);--> statement-breakpoint
CREATE TABLE `shop_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`icon` text NOT NULL,
	`sort_order` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vacation_days` (
	`date` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vacation_days_inventory_item_id_unique` ON `vacation_days` (`inventory_item_id`);