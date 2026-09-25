/**
 * Seed script: clusters Sofia's pedestrian tunnels from OSM into underpasses
 * and upserts one point per underpass to the underpasses table, deleting OSM
 * underpasses that no longer exist. Rows added by users are never touched.
 *
 * Clustering: tunnel ways (footway/steps/path, tunnel=yes, not indoor) that
 * share a node belong together; so do tunnels joined by a short untagged way
 * such as the stairs down, which mappers often leave without a tunnel tag.
 * The point is the centroid of the cluster's nodes, named after the nearest
 * street segments already in Supabase.
 *
 * Usage: pnpm tsx scripts/seed-underpasses.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LineString, Point } from "geojson";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TABLE = "underpasses";
const DELETE_BATCH_SIZE = 50;
const MIN_LENGTH_M = 10; // shorter tunnel clusters are mapping stubs
const CONNECTOR_MAX_M = 30; // untagged stairs/paths this short join two tunnels
const NAME_RADIUS_M = 40;

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

const OVERPASS_QUERY = `
[out:json][timeout:180];
area["name"="София"]["admin_level"="8"]->.sofia;
way["highway"~"^(footway|steps|path|pedestrian|cycleway)$"]["tunnel"="yes"](area.sofia)->.tun;
node(w.tun)->.tn;
way(bn.tn)["highway"~"^(footway|steps|path|pedestrian|corridor)$"](area.sofia)->.adj;
(.tun; .adj;);
out body;
>;
out skel qt;
`;

interface OsmNode { type: "node"; id: number; lat: number; lon: number }
interface OsmWay { type: "way"; id: number; nodes: number[]; tags?: Record<string, string> }
type OsmElement = OsmNode | OsmWay;

interface UnderpassRow {
  id: string;
  source: "osm";
  name: string | null;
  geojson: Point;
}

async function fetchOsm(): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      console.log(`Fetching from ${url}...`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "sidequest-seed/1.0" },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (err) {
      lastError = err;
      console.warn(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error(`All Overpass mirrors failed: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Minimal union-find over way ids. */
class Groups {
  private parent = new Map<number, number>();
  find(x: number): number {
    let root = x;
    while ((this.parent.get(root) ?? root) !== root) root = this.parent.get(root)!;
    while (x !== root) {
      const next = this.parent.get(x) ?? x;
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }
  union(a: number, b: number) {
    this.parent.set(this.find(a), this.find(b));
  }
}

function clusterUnderpasses(elements: OsmElement[]): { id: string; centroid: { lat: number; lon: number }; length: number; ways: number }[] {
  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  for (const e of elements) {
    if (e.type === "node") nodes.set(e.id, e);
    else ways.set(e.id, e);
  }
  const wayLength = (w: OsmWay) => {
    const pts = w.nodes.map((n) => nodes.get(n)).filter((n): n is OsmNode => !!n);
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += distanceM(pts[i - 1], pts[i]);
    return m;
  };
  const isTunnel = (w: OsmWay) => w.tags?.tunnel === "yes" && !w.tags?.indoor;
  // Ways that take part in clustering: tunnels, plus short connectors.
  const members = [...ways.values()].filter((w) => isTunnel(w) || wayLength(w) <= CONNECTOR_MAX_M);

  const groups = new Groups();
  const byNode = new Map<number, number[]>();
  for (const w of members) {
    for (const n of w.nodes) {
      const list = byNode.get(n) ?? [];
      list.push(w.id);
      byNode.set(n, list);
    }
  }
  for (const list of byNode.values()) for (let i = 1; i < list.length; i++) groups.union(list[0], list[i]);

  const clusters = new Map<number, OsmWay[]>();
  for (const w of members) {
    const root = groups.find(w.id);
    const list = clusters.get(root) ?? [];
    list.push(w);
    clusters.set(root, list);
  }

  const out: { id: string; centroid: { lat: number; lon: number }; length: number; ways: number }[] = [];
  for (const list of clusters.values()) {
    const tunnels = list.filter(isTunnel);
    if (tunnels.length === 0) continue; // a connector cluster with no tunnel
    const length = tunnels.reduce((sum, w) => sum + wayLength(w), 0);
    if (length < MIN_LENGTH_M) continue;
    const pts = [...new Set(tunnels.flatMap((w) => w.nodes))]
      .map((n) => nodes.get(n))
      .filter((n): n is OsmNode => !!n);
    const centroid = {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    };
    // Stable id: the smallest tunnel way id in the cluster.
    const key = Math.min(...tunnels.map((w) => w.id));
    out.push({ id: `u_${key}`, centroid, length, ways: tunnels.length });
  }
  return out;
}

interface SegmentLite { name: string | null; geojson: LineString }

/** Up to two distinct street names within NAME_RADIUS_M, nearest first. */
function nameFor(centroid: { lat: number; lon: number }, segments: SegmentLite[]): string | null {
  const found: { name: string; d: number }[] = [];
  for (const s of segments) {
    if (!s.name) continue;
    let best = Infinity;
    for (const [lon, lat] of s.geojson.coordinates) {
      const d = distanceM(centroid, { lat, lon });
      if (d < best) best = d;
      if (best > NAME_RADIUS_M * 4) break; // far away; skip the rest of this segment
    }
    if (best <= NAME_RADIUS_M) found.push({ name: s.name, d: best });
  }
  found.sort((a, b) => a.d - b.d);
  const names: string[] = [];
  for (const f of found) {
    if (!names.includes(f.name)) names.push(f.name);
    if (names.length === 2) break;
  }
  return names.length ? names.join(" × ") : null;
}

async function loadSegments(supabase: SupabaseClient): Promise<SegmentLite[]> {
  const rows: SegmentLite[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("segments")
      .select("name, geojson")
      .not("name", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as SegmentLite[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const clusters = clusterUnderpasses(await fetchOsm());
  console.log(`${clusters.length} underpasses (clusters of tunnel ways >= ${MIN_LENGTH_M} m)`);
  if (clusters.length === 0) throw new Error("No underpasses found; refusing to wipe the table");

  console.log("Naming after nearby streets...");
  const segments = await loadSegments(supabase);
  const rows: UnderpassRow[] = clusters.map((c) => ({
    id: c.id,
    source: "osm",
    name: nameFor(c.centroid, segments),
    geojson: { type: "Point", coordinates: [c.centroid.lon, c.centroid.lat] },
  }));
  console.log(`  ${rows.filter((r) => r.name).length} named, ${rows.filter((r) => !r.name).length} unnamed`);
  if (dryRun) return;

  const { error } = await supabase
    .from(TABLE)
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "id" });
  if (error) throw error;
  console.log(`Upserted ${rows.length} rows`);

  const { data: existing, error: listError } = await supabase.from(TABLE).select("id").eq("source", "osm");
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
