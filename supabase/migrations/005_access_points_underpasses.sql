-- Step-free access data: elevators and ramps as points, underpasses as points
-- with a per-browser "has a ramp?" vote.
--
-- access_points: elevators come from OSM (scripts/seed-metro.ts), ramps and
-- extra elevators are added by users on the spot. The metro seed only ever
-- touches rows with source = 'osm', so user additions survive a refresh.
CREATE TABLE access_points (
  id TEXT PRIMARY KEY,                 -- "e_<osm node id>" or "a_<uuid>" for user-added
  kind TEXT NOT NULL CHECK (kind IN ('elevator', 'ramp')),
  source TEXT NOT NULL CHECK (source IN ('osm', 'user')),
  osm_node_id BIGINT,
  label TEXT,                          -- nearest station/entrance name (OSM) or null
  level TEXT,                          -- OSM level tag, e.g. "0;-1", if any
  geojson JSONB NOT NULL,              -- GeoJSON Point
  created_by TEXT,                     -- browser id for user-added rows
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_access_points_created_by ON access_points (created_by);

-- underpasses: one point per pedestrian underpass, clustered from OSM tunnel
-- ways (scripts/seed-underpasses.ts) or added by a user. Whether it has a
-- ramp is answered by nearby ramp access_points and by votes below.
CREATE TABLE underpasses (
  id TEXT PRIMARY KEY,                 -- "u_<osm way id>" or "u_<uuid>" for user-added
  source TEXT NOT NULL CHECK (source IN ('osm', 'user')),
  name TEXT,                           -- nearest street name(s)
  geojson JSONB NOT NULL,              -- GeoJSON Point
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One vote per browser per underpass: has_ramp = false means "I looked, no ramps".
CREATE TABLE underpass_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  underpass_id TEXT NOT NULL REFERENCES underpasses(id) ON DELETE CASCADE,
  browser_id TEXT NOT NULL,
  has_ramp BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_underpass_votes_underpass_browser ON underpass_votes (underpass_id, browser_id);

ALTER TABLE access_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE underpasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE underpass_votes ENABLE ROW LEVEL SECURITY;
