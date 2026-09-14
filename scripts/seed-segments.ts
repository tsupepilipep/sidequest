/**
 * Seed script: fetches Sofia road data from Overpass API,
 * splits roads at intersections, and upserts segments to Supabase.
 *
 * Usage: pnpm tsx scripts/seed-segments.ts [--dry-run]
 *   --dry-run  fetch and process, print statistics, write nothing
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { length } from "@turf/length";
import { lineString } from "@turf/helpers";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const osmtogeojson = require("osmtogeojson");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 500;
// Deletes pass IDs in the URL, and IDs are ~50 chars, so keep these small.
const DELETE_BATCH_SIZE = 50;
const MIN_SEGMENT_LENGTH_KM = 0.02; // 20 meters
// Segments that meet end-to-end with no third road are merged back together,
// but never beyond this length so one rating stays roughly block-sized.
const MAX_MERGED_LENGTH_KM = 0.4; // 400 meters
// Unnamed segments are only merged when they continue nearly straight.
const MIN_UNNAMED_CONTINUATION_ANGLE = 135; // degrees, 180 = perfectly straight

// Public Overpass instances, tried in order; the main one is often overloaded.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];
const OVERPASS_ATTEMPTS = 2; // full passes over the mirror list

// Overpass query for Sofia roads within the admin boundary
const OVERPASS_QUERY = `
[out:json][timeout:300];
area["name"="София"]["admin_level"="8"]->.sofia;
(
  way["highway"~"^(primary|secondary|tertiary|residential|living_street|pedestrian|unclassified)$"](area.sofia);
);
out body;
>;
out skel qt;
`;

interface SegmentRow {
  id: string;
  osm_way_id: number;
  name: string | null;
  highway_type: string;
  geojson: LineString;
}

interface IntersectionRow {
  id: string;
  geojson: Point;
  street_names: string[];
  degree: number;
}

// A node counts as an intersection when at least this many segments end there.
const MIN_INTERSECTION_DEGREE = 3;

async function fetchOverpassData(): Promise<unknown> {
  console.log("Fetching data from Overpass API (this may take a few minutes)...");
  let lastError: unknown;

  for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS; attempt++) {
    for (const url of OVERPASS_URLS) {
      try {
        console.log(`  Trying ${url} (attempt ${attempt})...`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Overpass returns 406 for Node's default User-Agent
            "User-Agent": "sidequest-seed/1.0",
          },
          body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        });

        if (!res.ok) {
          // Overpass returns an HTML error page; keep only its message line.
          const body = await res.text();
          const msg = body.match(/<strong[^>]*>Error<\/strong>:\s*([^<]+)/)?.[1]?.trim() ?? body.slice(0, 200);
          throw new Error(`HTTP ${res.status}: ${msg}`);
        }

        const data = await res.json();
        console.log(`Received ${data.elements?.length ?? 0} elements from Overpass`);
        return data;
      } catch (err) {
        lastError = err;
        console.warn(`  Failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  throw new Error(`All Overpass mirrors failed. Last error: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function coordKey(coord: number[]): string {
  return `${coord[0].toFixed(7)},${coord[1].toFixed(7)}`;
}

function splitAtIntersections(
  geojson: FeatureCollection
): SegmentRow[] {
  // Step 1: Build node degree map — count how many ways pass through each coordinate
  const nodeDegree = new Map<string, number>();
  const lineFeatures = geojson.features.filter(
    (f): f is Feature<LineString> => f.geometry?.type === "LineString"
  );

  console.log(`Processing ${lineFeatures.length} LineString features...`);

  for (const feature of lineFeatures) {
    const coords = feature.geometry.coordinates;
    for (const coord of coords) {
      const key = coordKey(coord);
      nodeDegree.set(key, (nodeDegree.get(key) ?? 0) + 1);
    }
  }

  // Step 2: Split each way at intersection nodes (degree >= 2) and at endpoints
  const segments: SegmentRow[] = [];

  for (const feature of lineFeatures) {
    const coords = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    const osmWayId = Number(props.id?.replace("way/", "")) || 0;
    const name = props.name ?? props["name:en"] ?? null;
    const highwayType = props.highway ?? "unknown";

    let currentSegCoords: number[][] = [coords[0]];

    for (let i = 1; i < coords.length; i++) {
      currentSegCoords.push(coords[i]);

      const isEnd = i === coords.length - 1;
      const isIntersection =
        !isEnd && (nodeDegree.get(coordKey(coords[i])) ?? 0) >= 2;

      if (isEnd || isIntersection) {
        // Short pieces are kept here on purpose: they are needed so the merge
        // pass can chain them back together (some streets are mapped in OSM as
        // dozens of 10 m ways) and so they still count as a third leg at real
        // junctions. Length filtering happens after merging.
        if (currentSegCoords.length >= 2) {
          const geom = lineString(currentSegCoords);
          // Deterministic ID from way ID + start/end coordinates
          const startKey = coordKey(currentSegCoords[0]);
          const endKey = coordKey(
            currentSegCoords[currentSegCoords.length - 1]
          );
          const id = `${osmWayId}_${startKey}_${endKey}`;

          segments.push({
            id,
            osm_way_id: osmWayId,
            name,
            highway_type: highwayType,
            geojson: geom.geometry,
          });
        }

        // Start new segment from the current intersection node
        if (!isEnd) {
          currentSegCoords = [coords[i]];
        }
      }
    }
  }

  return segments;
}

/** Compass bearing (degrees) of the direction from `a` to `b`. */
function bearing(a: number[], b: number[]): number {
  return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
}

/**
 * Angle between two segments that share a node, measured at that node.
 * 180 means one continues straight into the other, 90 is a right angle.
 */
function continuationAngle(
  a: SegmentRow,
  aEnd: "start" | "end",
  b: SegmentRow,
  bEnd: "start" | "end"
): number {
  const leaving = (seg: SegmentRow, end: "start" | "end") => {
    const c = seg.geojson.coordinates;
    return end === "start" ? bearing(c[0], c[1]) : bearing(c[c.length - 1], c[c.length - 2]);
  };
  let diff = Math.abs(leaving(a, aEnd) - leaving(b, bEnd)) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function segmentLengthKm(seg: SegmentRow): number {
  return length(lineString(seg.geojson.coordinates), { units: "kilometers" });
}

/**
 * OSM stores one street as many consecutive ways (split wherever a tag such as
 * maxspeed or surface changes). `splitAtIntersections` therefore cuts at nodes
 * where only two ways meet end-to-end, which are not real junctions.
 *
 * This pass finds nodes that are an endpoint of exactly two segments and no
 * others, and joins those segments back into one when they plausibly belong to
 * the same street: identical names, or both unnamed with the same highway type
 * and a near-straight continuation. Merged length is capped so a single
 * segment never spans more than a few blocks.
 */
export function mergeSpuriousSplits(segments: SegmentRow[]): SegmentRow[] {
  type Endpoint = { idx: number; end: "start" | "end" };
  const endpoints = new Map<string, Endpoint[]>();
  for (let idx = 0; idx < segments.length; idx++) {
    const c = segments[idx].geojson.coordinates;
    const push = (key: string, end: "start" | "end") => {
      const list = endpoints.get(key) ?? [];
      list.push({ idx, end });
      endpoints.set(key, list);
    };
    push(coordKey(c[0]), "start");
    push(coordKey(c[c.length - 1]), "end");
  }

  // Union-find over segments, tracking total length so the cap is exact.
  const parent = segments.map((_, i) => i);
  const compLength = segments.map(segmentLengthKm);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  // Accepted joins: for each segment, which segment continues from each end.
  const startPartner = new Map<number, Endpoint>();
  const endPartner = new Map<number, Endpoint>();

  let considered = 0;
  let rejectedByRule = 0;
  let rejectedByLength = 0;

  for (const list of endpoints.values()) {
    if (list.length !== 2) continue;
    const [p, q] = list;
    if (p.idx === q.idx) continue; // a closed loop
    considered++;

    const a = segments[p.idx];
    const b = segments[q.idx];
    let sameStreet: boolean;
    if (a.name !== null || b.name !== null) {
      sameStreet = a.name === b.name;
    } else {
      sameStreet =
        a.highway_type === b.highway_type &&
        continuationAngle(a, p.end, b, q.end) >= MIN_UNNAMED_CONTINUATION_ANGLE;
    }
    if (!sameStreet) {
      rejectedByRule++;
      continue;
    }

    const ra = find(p.idx);
    const rb = find(q.idx);
    if (ra === rb) continue; // would close a ring
    if (compLength[ra] + compLength[rb] > MAX_MERGED_LENGTH_KM) {
      rejectedByLength++;
      continue;
    }

    parent[ra] = rb;
    compLength[rb] += compLength[ra];
    (p.end === "start" ? startPartner : endPartner).set(p.idx, q);
    (q.end === "start" ? startPartner : endPartner).set(q.idx, p);
  }

  // Walk each chain from its head, concatenating coordinates in a consistent
  // direction. Chains are simple paths: each segment has at most one partner
  // per end, and the ring check above prevents cycles.
  const visited = new Array<boolean>(segments.length).fill(false);
  const merged: SegmentRow[] = [];
  let chains = 0;

  for (let idx = 0; idx < segments.length; idx++) {
    if (visited[idx]) continue;

    // Find the head: follow "start" partners until a segment has none.
    // Orientation flips when we arrive at a partner's end rather than its start.
    let cur = idx;
    let forward = true; // true: the chain runs start->end through `cur`
    for (;;) {
      const back: Endpoint | undefined = forward ? startPartner.get(cur) : endPartner.get(cur);
      if (!back) break;
      cur = back.idx;
      // Arriving at the partner's end means it points toward us, so its
      // natural direction matches ours; arriving at its start means it's reversed.
      forward = back.end === "end";
    }

    // Walk forward from the head, collecting pieces.
    const pieces: SegmentRow[] = [];
    const coords: number[][] = [];
    for (;;) {
      visited[cur] = true;
      const seg = segments[cur];
      pieces.push(seg);
      const c = forward ? seg.geojson.coordinates : [...seg.geojson.coordinates].reverse();
      for (let k = coords.length === 0 ? 0 : 1; k < c.length; k++) coords.push(c[k]);

      const next = forward ? endPartner.get(cur) : startPartner.get(cur);
      if (!next) break;
      cur = next.idx;
      forward = next.end === "start";
    }

    if (pieces.length === 1) {
      merged.push(pieces[0]);
      continue;
    }
    chains++;

    // Deterministic orientation and ID regardless of traversal order.
    let ordered = coords;
    if (coordKey(coords[coords.length - 1]) < coordKey(coords[0])) {
      ordered = [...coords].reverse();
    }
    const startKey = coordKey(ordered[0]);
    const endKey = coordKey(ordered[ordered.length - 1]);
    const osmWayId = Math.min(...pieces.map((s) => s.osm_way_id));
    const typeCounts = new Map<string, number>();
    for (const s of pieces) typeCounts.set(s.highway_type, (typeCounts.get(s.highway_type) ?? 0) + 1);
    const highwayType = [...typeCounts.entries()].sort((x, y) => y[1] - x[1])[0][0];

    merged.push({
      id: `${osmWayId}_${startKey}_${endKey}`,
      osm_way_id: osmWayId,
      name: pieces[0].name,
      highway_type: highwayType,
      geojson: lineString(ordered).geometry,
    });
  }

  dedupeIds(merged);

  console.log(
    `Merge pass: ${considered} two-segment joins considered, ` +
      `${rejectedByRule} kept split (different street), ` +
      `${rejectedByLength} kept split (length cap ${MAX_MERGED_LENGTH_KM * 1000}m), ` +
      `${chains} chains merged`
  );
  return merged;
}

/**
 * IDs are derived from way id + endpoints, so the two halves of a small loop
 * (a roundabout, a cul-de-sac bulb) can collide. Suffix such duplicates in a
 * deterministic order so reseeds produce the same IDs.
 */
function dedupeIds(segments: SegmentRow[]): void {
  const byId = new Map<string, SegmentRow[]>();
  for (const s of segments) byId.set(s.id, [...(byId.get(s.id) ?? []), s]);
  let fixed = 0;
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    group.sort((a, b) =>
      JSON.stringify(a.geojson.coordinates).localeCompare(JSON.stringify(b.geojson.coordinates))
    );
    group.forEach((s, i) => {
      if (i > 0) s.id = `${id}_${i + 1}`;
    });
    fixed += group.length - 1;
  }
  if (fixed > 0) console.log(`Disambiguated ${fixed} colliding segment id(s)`);
}

/**
 * Intersections are the nodes where MIN_INTERSECTION_DEGREE or more segments
 * end. Computed from the final segment list so they match what is drawn.
 * A two-segment corner where a street merely changes name is not one.
 */
function buildIntersections(segments: SegmentRow[]): IntersectionRow[] {
  const nodes = new Map<string, { coord: number[]; names: Set<string>; degree: number }>();
  for (const seg of segments) {
    const c = seg.geojson.coordinates;
    for (const coord of [c[0], c[c.length - 1]]) {
      const key = coordKey(coord);
      const node = nodes.get(key) ?? { coord, names: new Set<string>(), degree: 0 };
      node.degree++;
      if (seg.name) node.names.add(seg.name);
      nodes.set(key, node);
    }
  }

  const rows: IntersectionRow[] = [];
  for (const [key, node] of nodes) {
    if (node.degree < MIN_INTERSECTION_DEGREE) continue;
    rows.push({
      id: `x_${key}`,
      geojson: { type: "Point", coordinates: [node.coord[0], node.coord[1]] },
      street_names: [...node.names].sort(),
      degree: node.degree,
    });
  }
  return rows;
}

/** Remove rows (and, via cascade, their ratings) whose ids are not in `keepIds`. */
async function deleteStaleRows(table: string, keepIds: Set<string>): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const existing: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) existing.push(row.id as string);
    if (data.length < PAGE) break;
  }

  const stale = existing.filter((id) => !keepIds.has(id));
  console.log(`Deleting ${stale.length} stale ${table} (of ${existing.length} existing)...`);

  for (let i = 0; i < stale.length; i += DELETE_BATCH_SIZE) {
    const batch = stale.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (error) {
      console.error(`Error deleting ${table} batch at offset ${i}:`, error);
      throw error;
    }
    if ((i / DELETE_BATCH_SIZE) % 20 === 0 || i + DELETE_BATCH_SIZE >= stale.length) {
      console.log(`  Deleted ${Math.min(i + DELETE_BATCH_SIZE, stale.length)} / ${stale.length}`);
    }
  }
}

async function upsertRows<T extends { id: string }>(table: string, rows: T[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Upserting ${rows.length} ${table} in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`Error upserting ${table} batch at offset ${i}:`, error);
      throw error;
    }

    if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  Upserted ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && (!SUPABASE_URL || SUPABASE_URL === "your-supabase-url")) {
    console.error("Error: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const osmData = await fetchOverpassData();
  const geojson = osmtogeojson(osmData) as FeatureCollection;
  console.log(`Converted to ${geojson.features.length} GeoJSON features`);

  const split = splitAtIntersections(geojson);
  console.log(`Split into ${split.length} segments`);

  const merged = mergeSpuriousSplits(split);
  console.log(`${merged.length} segments after merging spurious splits`);

  const segments = merged.filter((s) => segmentLengthKm(s) >= MIN_SEGMENT_LENGTH_KM);
  console.log(
    `${segments.length} segments after dropping ${merged.length - segments.length} shorter than ${MIN_SEGMENT_LENGTH_KM * 1000}m`
  );

  const intersections = buildIntersections(segments);
  const degreeHist = new Map<number, number>();
  for (const x of intersections) degreeHist.set(x.degree, (degreeHist.get(x.degree) ?? 0) + 1);
  console.log(
    `${intersections.length} intersections (degree: ${[...degreeHist.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `${d}→${n}`)
      .join(", ")})`
  );

  if (dryRun) {
    const lens = segments.map(segmentLengthKm);
    const totalKm = lens.reduce((a, b) => a + b, 0);
    console.log(`Dry run: total ${totalKm.toFixed(1)} km, longest ${(Math.max(...lens) * 1000).toFixed(0)} m, no database writes.`);
    return;
  }

  await upsertRows("segments", segments);
  await deleteStaleRows("segments", new Set(segments.map((s) => s.id)));
  await upsertRows("intersections", intersections);
  await deleteStaleRows("intersections", new Set(intersections.map((x) => x.id)));
  console.log("Done! Segments and intersections seeded successfully.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
