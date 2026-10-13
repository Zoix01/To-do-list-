CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`source` text NOT NULL,
	`source_key` text NOT NULL,
	`source_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_source_idx` ON `inventory_items` (`source_key`,`source_index`);--> statement-breakpoint
CREATE TABLE `rewards_ledger` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`date` text NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`shards` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`boxes` integer DEFAULT 0 NOT NULL,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rewards_ledger_date_idx` ON `rewards_ledger` (`date`);--> statement-breakpoint
CREATE INDEX `rewards_ledger_item_idx` ON `rewards_ledger` (`kind`,`item_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `week_snapshot_items` (
	`week_start` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`weight` integer NOT NULL,
	`value_per_completion` integer NOT NULL,
	PRIMARY KEY(`week_start`, `item_type`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `week_snapshots` (
	`week_start` text PRIMARY KEY NOT NULL,
	`budget` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `habits` ADD `weight` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `weight` integer DEFAULT 5 NOT NULL;