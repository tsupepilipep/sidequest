-- Nicknames and the leaderboard.
--
-- profiles: one row per anonymous browser id with a generated nickname
-- (adjective + animal, see src/lib/nicknames.ts). Rows are created lazily
-- by the API the first time a browser opens its stats or appears on the
-- leaderboard, so every rater gets a name without any sign-up.
CREATE TABLE profiles (
  browser_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Votes and metres of sidewalk per browser, optionally only counting votes
-- first cast since p_since. A vote's created_at is set on insert and left
-- alone when the vote is changed, so changing your mind never counts twice.
-- The geometry column is unused by the seed, so lengths come from geojson.
CREATE OR REPLACE FUNCTION leaderboard(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE (browser_id TEXT, votes BIGINT, meters DOUBLE PRECISION) AS $$
  WITH v AS (
    SELECT r.browser_id, r.created_at,
           ST_Length(ST_GeomFromGeoJSON(s.geojson::text)::geography) AS m
    FROM ratings r
    JOIN segments s ON s.id = r.segment_id
    UNION ALL
    SELECT ir.browser_id, ir.created_at, 0::DOUBLE PRECISION
    FROM intersection_ratings ir
  )
  SELECT v.browser_id, COUNT(*) AS votes, COALESCE(SUM(v.m), 0) AS meters
  FROM v
  WHERE p_since IS NULL OR v.created_at >= p_since
  GROUP BY v.browser_id
  ORDER BY votes DESC, meters DESC;
$$ LANGUAGE sql STABLE;

REVOKE EXECUTE ON FUNCTION leaderboard(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
