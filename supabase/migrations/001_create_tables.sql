-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Segments table: one row per block-length road segment
CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  osm_way_id BIGINT,
  name TEXT,
  highway_type TEXT,
  geojson JSONB NOT NULL,              -- cached GeoJSON geometry
  geometry geography(LINESTRING, 4326),
  median_rating REAL,
  rating_count INT DEFAULT 0
);

CREATE INDEX idx_segments_geometry ON segments USING GIST (geometry);

-- Ratings table: one rating per browser per segment
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  browser_id TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 0 AND rating <= 2),
  side TEXT,                            -- optional: 'left', 'right', or null
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_ratings_segment_browser ON ratings (segment_id, browser_id);
CREATE INDEX idx_ratings_segment_id ON ratings (segment_id);

-- Function to recompute median rating for a segment
CREATE OR REPLACE FUNCTION update_segment_median(p_segment_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE segments
  SET
    median_rating = sub.median,
    rating_count = sub.cnt
  FROM (
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating) AS median,
      COUNT(*)::INT AS cnt
    FROM ratings
    WHERE segment_id = p_segment_id
  ) sub
  WHERE id = p_segment_id;
END;
$$ LANGUAGE plpgsql;
