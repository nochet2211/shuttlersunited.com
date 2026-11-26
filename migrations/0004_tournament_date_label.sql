-- Shown in place of the dates when the exact days aren't known ("2023").
-- start_date still orders the tournament; it just isn't displayed.
ALTER TABLE tournaments ADD COLUMN date_label TEXT NOT NULL DEFAULT '';
