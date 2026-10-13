CREATE TABLE `owned_cosmetics` (
	`cosmetic_id` text PRIMARY KEY NOT NULL,
	`acquired_at` text NOT NULL,
	`source` text NOT NULL,
	`source_key` text NOT NULL
);
