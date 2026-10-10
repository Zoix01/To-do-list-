-- Red and amber were removed from the list palette (they mean overdue / missed plan
-- and high / medium priority). Move lists that used them to the new colors.
UPDATE `lists` SET `color` = '#B77CD0' WHERE `color` = '#D9675A';
--> statement-breakpoint
UPDATE `lists` SET `color` = '#4FB077' WHERE `color` = '#D9B25A';
