import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import type { IntersectionRow, IntersectionsGeoJSON, IntersectionFeature } from "@/lib/types";

const PAGE = 1000;

export async function GET() {
  const supabase = getServiceClient();

  // PostgREST caps a single select at 1000 rows by default; page through.
  const rows: IntersectionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("intersections")
      .select("id, geojson, street_names, degree, median_rating, rating_count")
      .order("id")
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as IntersectionRow[]));
    if (data.length < PAGE) break;
  }

  const features: IntersectionFeature[] = rows.map((row) => ({
    type: "Feature" as const,
    geometry: row.geojson,
    properties: {
      id: row.id,
      street_names: row.street_names ?? [],
      degree: row.degree,
      median_rating: row.median_rating,
      rating_count: row.rating_count,
    },
  }));

  const geojson: IntersectionsGeoJSON = { type: "FeatureCollection", features };

  return NextResponse.json(geojson, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
