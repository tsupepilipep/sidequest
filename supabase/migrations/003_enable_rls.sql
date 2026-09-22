-- Lock the public schema down. The app only ever reaches the database through
-- Next.js API routes using the service role key, which bypasses RLS. Enabling
-- RLS with no policies means the anon/authenticated roles can do nothing via
-- PostgREST, so a leaked project URL or publishable key exposes no data.
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intersections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intersection_ratings ENABLE ROW LEVEL SECURITY;

-- The median recompute functions are only called from the server.
REVOKE EXECUTE ON FUNCTION update_segment_median(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_intersection_median(TEXT) FROM PUBLIC, anon, authenticated;
