-- "Permanently closed" reports on elevators and ramps: one per browser per
-- point, withdrawable. Any report marks the point closed on the map.
CREATE TABLE access_point_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_point_id TEXT NOT NULL REFERENCES access_points(id) ON DELETE CASCADE,
  browser_id TEXT NOT NULL,
  closed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_access_point_votes_point_browser ON access_point_votes (access_point_id, browser_id);

ALTER TABLE access_point_votes ENABLE ROW LEVEL SECURITY;
