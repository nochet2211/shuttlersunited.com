-- The club each side plays for. An interclub draw is read club against club,
-- so the bracket shows it under the names. Empty when it doesn't apply.
ALTER TABLE matches ADD COLUMN side_a_club TEXT NOT NULL DEFAULT '';
ALTER TABLE matches ADD COLUMN side_b_club TEXT NOT NULL DEFAULT '';
