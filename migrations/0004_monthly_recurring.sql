DROP INDEX `tasks_recurring_week_idx`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `occurrence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_recurring_period_idx` ON `tasks` (`recurring_id`,`week_start`,`occurrence`);--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `period` text DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `month_days` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `times_per_month` integer;