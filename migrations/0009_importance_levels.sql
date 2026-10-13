-- The 1–10 weight becomes an importance level 1–4 (Light, Normal, Important, Essential), SPEC §13.3.
UPDATE `habits` SET `weight` = CASE
  WHEN `weight` <= 3 THEN 1
  WHEN `weight` <= 6 THEN 2
  WHEN `weight` <= 8 THEN 3
  ELSE 4
END;
--> statement-breakpoint
UPDATE `recurring_tasks` SET `weight` = CASE
  WHEN `weight` <= 3 THEN 1
  WHEN `weight` <= 6 THEN 2
  WHEN `weight` <= 8 THEN 3
  ELSE 4
END;
