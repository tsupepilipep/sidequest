import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import type { SegmentRow, SegmentsGeoJSON, SegmentFeature } from "@/lib/types";
import type { LineString } from "geojson";

export async function GET() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("segments")
    .select("id, osm_way_id, name, highway_type, geojson, median_rating, rating_count");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const features: SegmentFeature[] = (data as SegmentRow[]).map((row) => ({
    type: "Feature" as const,
    geometry: row.geojson as LineString,
    properties: {
      id: row.id,
      osm_way_id: row.osm_way_id,
      name: row.name,
      highway_type: row.highway_type,
      median_rating: row.median_rating,
      rating_count: row.rating_count,
    },
  }));

  const geojson: SegmentsGeoJSON = {
    type: "FeatureCollection",
    features,
  };

  return NextResponse.json(geojson, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
