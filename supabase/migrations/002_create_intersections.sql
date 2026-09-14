-- Intersections: one row per node where three or more segments meet.
-- Seeded by scripts/seed-segments.ts alongside segments.
CREATE TABLE intersections (
  id TEXT PRIMARY KEY,                 -- "x_<lng>,<lat>" derived from the node coordinate
  geojson JSONB NOT NULL,              -- GeoJSON Point
  street_names TEXT[] NOT NULL DEFAULT '{}',
  degree INT NOT NULL,                 -- number of segments meeting here
  median_rating REAL,
  rating_count INT DEFAULT 0
);

-- Ratings for intersections: one per browser per intersection
CREATE TABLE intersection_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intersection_id TEXT NOT NULL REFERENCES intersections(id) ON DELETE CASCADE,
  browser_id TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 0 AND rating <= 2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_intersection_ratings_intersection_browser
  ON intersection_ratings (intersection_id, browser_id);
CREATE INDEX idx_intersection_ratings_browser_id ON intersection_ratings (browser_id);

-- Also speeds up the "my ratings" lookup for sidewalks
CREATE INDEX IF NOT EXISTS idx_ratings_browser_id ON ratings (browser_id);

-- Recompute median rating for an intersection
CREATE OR REPLACE FUNCTION update_intersection_median(p_intersection_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE intersections
  SET
    median_rating = sub.median,
    rating_count = sub.cnt
  FROM (
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating) AS median,
      COUNT(*)::INT AS cnt
    FROM intersection_ratings
    WHERE intersection_id = p_intersection_id
  ) sub
  WHERE id = p_intersection_id;
END;
$$ LANGUAGE plpgsql;
