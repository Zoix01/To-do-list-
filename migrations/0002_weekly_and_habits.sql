CREATE TABLE `habit_checks` (
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`habit_id`, `date`),
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text,
	`frequency` text NOT NULL,
	`weekdays` text DEFAULT '[]' NOT NULL,
	`target` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text,
	`title` text NOT NULL,
	`notes` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`mode` text NOT NULL,
	`weekday` integer,
	`active` integer DEFAULT true NOT NULL,
	`active_from` text NOT NULL,
	`generated_through` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
