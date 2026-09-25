/**
 * Seed script: fetches Sofia metro elevators from Overpass and upserts them to
 * the access_points table, deleting OSM elevators no longer in OSM. Rows added
 * by users (source = 'user') are never touched.
 *
 * An elevator counts as a metro elevator when it is within STATION_RADIUS_M of
 * a subway station node or ENTRANCE_RADIUS_M of a subway entrance node, and
 * it is not tagged as underground-only. OSM maps one node per shaft, and deep
 * stations have several internal ones between mezzanine and platform; those
 * carry a level tag like "-1;-2" and stay off the map. Elevators with no
 * level tag are kept: in practice they are the street lifts nobody tagged.
 *
 * Usage: pnpm tsx scripts/seed-metro.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import type { Point } from "geojson";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TABLE = "access_points";
const DELETE_BATCH_SIZE = 50;
const STATION_RADIUS_M = 150;
const ENTRANCE_RADIUS_M = 50;

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

const OVERPASS_QUERY = `
[out:json][timeout:120];
area["name"="София"]["admin_level"="8"]->.sofia;
(
  node["highway"="elevator"](area.sofia);
  node["railway"="station"]["station"="subway"](area.sofia);
  node["railway"="subway_entrance"](area.sofia);
);
out body;
`;

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface MetroElevatorRow {
  id: string;
  kind: "elevator";
  source: "osm";
  osm_node_id: number;
  label: string | null;
  level: string | null;
  geojson: Point;
}

async function fetchNodes(): Promise<OsmNode[]> {
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      console.log(`Fetching from ${url}...`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "sidequest-seed/1.0",
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { elements: OsmNode[] };
      return data.elements.filter((e) => e.type === "node");
    } catch (err) {
      lastError = err;
      console.warn(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error(`All Overpass mirrors failed: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function distanceM(a: OsmNode, b: OsmNode): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function nearest(node: OsmNode, candidates: OsmNode[]): { node: OsmNode; d: number } | null {
  let best: { node: OsmNode; d: number } | null = null;
  for (const c of candidates) {
    const d = distanceM(node, c);
    if (!best || d < best.d) best = { node: c, d };
  }
  return best;
}

/** Whether an OSM level tag ("0;-1", "-1;-2", "0") may reach street level. Untagged: yes. */
export function mayReachStreet(level: string | undefined): boolean {
  if (!level) return true;
  return level.split(/[;,]/).some((part) => parseFloat(part.trim()) >= 0);
}

function pickMetroElevators(nodes: OsmNode[]): MetroElevatorRow[] {
  const tag = (n: OsmNode, k: string) => n.tags?.[k];
  const stations = nodes.filter((n) => tag(n, "railway") === "station");
  const entrances = nodes.filter((n) => tag(n, "railway") === "subway_entrance");
  const allElevators = nodes.filter(
    (n) => tag(n, "highway") === "elevator" && !["private", "no"].includes(tag(n, "access") ?? "")
  );
  const elevators = allElevators.filter((n) => mayReachStreet(tag(n, "level")));
  console.log(
    `${allElevators.length} elevators (${elevators.length} not underground-only), ${stations.length} stations, ${entrances.length} entrances`
  );

  const rows: MetroElevatorRow[] = [];
  for (const e of elevators) {
    const station = nearest(e, stations);
    const entrance = nearest(e, entrances);
    const isMetro =
      (station && station.d <= STATION_RADIUS_M) || (entrance && entrance.d <= ENTRANCE_RADIUS_M);
    if (!isMetro) continue;
    // Prefer the entrance's name (it names the station too) when it's closer;
    // station nodes sit at the platform and can be far from a street lift.
    const stationName =
      (entrance && entrance.d <= ENTRANCE_RADIUS_M ? tag(entrance.node, "name") : undefined) ??
      station?.node.tags?.name ??
      null;
    rows.push({
      id: `e_${e.id}`,
      kind: "elevator",
      source: "osm",
      osm_node_id: e.id,
      label: stationName,
      level: tag(e, "level") ?? null,
      geojson: { type: "Point", coordinates: [e.lon, e.lat] },
    });
  }
  return rows;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }

  const rows = pickMetroElevators(await fetchNodes());
  const stationsCovered = new Set(rows.map((r) => r.label).filter(Boolean)).size;
  console.log(`${rows.length} metro elevators at ${stationsCovered} named stations`);
  if (rows.length === 0) throw new Error("No metro elevators found; refusing to wipe the table");
  if (dryRun) return;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "id" });
  if (error) throw error;
  console.log(`Upserted ${rows.length} rows`);

  const { data: existing, error: listError } = await supabase
    .from(TABLE)
    .select("id")
    .eq("source", "osm")
    .eq("kind", "elevator");
  if (listError) throw listError;
  const keep = new Set(rows.map((r) => r.id));
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += DELETE_BATCH_SIZE) {
    const { error: delError } = await supabase.from(TABLE).delete().in("id", stale.slice(i, i + DELETE_BATCH_SIZE));
    if (delError) throw delError;
  }
  console.log(`Deleted ${stale.length} stale rows. Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
