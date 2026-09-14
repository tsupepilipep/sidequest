/**
 * Seed script: fetches Sofia road data from Overpass API,
 * splits roads at intersections, and upserts segments to Supabase.
 *
 * Usage: pnpm tsx scripts/seed-segments.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { length } from "@turf/length";
import { lineString } from "@turf/helpers";
import type { Feature, FeatureCollection, LineString } from "geojson";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const osmtogeojson = require("osmtogeojson");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 500;
const MIN_SEGMENT_LENGTH_KM = 0.02; // 20 meters

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

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
  geojson: object;
}

async function fetchOverpassData(): Promise<unknown> {
  console.log("Fetching data from Overpass API (this may take a few minutes)...");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Overpass returns 406 for Node's default User-Agent
      "User-Agent": "sidequest-seed/1.0",
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`Received ${data.elements?.length ?? 0} elements from Overpass`);
  return data;
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
        if (currentSegCoords.length >= 2) {
          const geom = lineString(currentSegCoords);
          const lengthKm = length(geom, { units: "kilometers" });

          if (lengthKm >= MIN_SEGMENT_LENGTH_KM) {
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

async function upsertSegments(segments: SegmentRow[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Upserting ${segments.length} segments in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("segments").upsert(
      batch.map((s) => ({
        id: s.id,
        osm_way_id: s.osm_way_id,
        name: s.name,
        highway_type: s.highway_type,
        geojson: s.geojson,
      })),
      { onConflict: "id" }
    );

    if (error) {
      console.error(`Error upserting batch at offset ${i}:`, error);
      throw error;
    }

    console.log(`  Upserted ${Math.min(i + BATCH_SIZE, segments.length)} / ${segments.length}`);
  }
}

async function main() {
  if (!SUPABASE_URL || SUPABASE_URL === "your-supabase-url") {
    console.error("Error: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const osmData = await fetchOverpassData();
  const geojson = osmtogeojson(osmData) as FeatureCollection;
  console.log(`Converted to ${geojson.features.length} GeoJSON features`);

  const segments = splitAtIntersections(geojson);
  console.log(`Split into ${segments.length} segments (after filtering < ${MIN_SEGMENT_LENGTH_KM * 1000}m)`);

  await upsertSegments(segments);
  console.log("Done! Segments seeded successfully.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
