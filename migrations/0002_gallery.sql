-- Club photos for /gallery. The image lives in R2 at gallery/<id>/<image>;
-- width and height let the grid give portrait shots a tall tile instead of
-- cropping them to a square.
CREATE TABLE gallery (
  id      TEXT PRIMARY KEY NOT NULL,
  image   TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  -- Who took it, when it isn't the club's own: "Nagaland Badminton Association".
  credit  TEXT NOT NULL DEFAULT '',
  width   NUMERIC NOT NULL DEFAULT 0,
  height  NUMERIC NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT '',
  updated TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_gallery_created ON gallery (created);
