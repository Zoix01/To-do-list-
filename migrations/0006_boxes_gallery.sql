CREATE TABLE `box_openings` (
	`box_id` text PRIMARY KEY NOT NULL,
	`attempt` text NOT NULL,
	`type` text NOT NULL,
	`tier` text,
	`piece_id` text,
	`season_id` text,
	`duplicate` integer DEFAULT false NOT NULL,
	`shards` integer DEFAULT 0 NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`reward_id` text,
	`reward_name` text,
	`cosmetic_id` text,
	`charm_used` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owned_pieces` (
	`piece_id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`source` text NOT NULL
);
