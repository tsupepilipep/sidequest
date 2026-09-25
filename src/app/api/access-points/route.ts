import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase/server";
import { inSofia } from "@/lib/geo/sofia";
import type { AccessPointFeature, AccessPointRow, AccessPointsGeoJSON } from "@/lib/types";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET /api/access-points -> GeoJSON of elevators and ramps (OSM and user-added). */
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("access_points")
    .select("id, kind, source, label, level, geojson")
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const features: AccessPointFeature[] = (data as AccessPointRow[]).map((row) => ({
    type: "Feature" as const,
    geometry: row.geojson,
    properties: { id: row.id, kind: row.kind, source: row.source, label: row.label, level: row.level },
  }));
  const geojson: AccessPointsGeoJSON = { type: "FeatureCollection", features };
  // Short shared cache: user additions should show up for others within a minute.
  return NextResponse.json(geojson, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

/** POST /api/access-points { kind, lat, lng, browser_id } -> the new feature. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { kind?: string; lat?: number; lng?: number; browser_id?: string };
  const kind = body.kind === "elevator" || body.kind === "ramp" ? body.kind : null;
  if (!kind || !body.browser_id || typeof body.lat !== "number" || typeof body.lng !== "number" || !inSofia(body.lat, body.lng)) {
    return NextResponse.json({ error: "Required: kind (elevator|ramp), lat/lng inside Sofia, browser_id" }, { status: 400 });
  }
  const row = {
    id: `a_${randomUUID()}`,
    kind,
    source: "user" as const,
    label: null,
    level: null,
    geojson: { type: "Point" as const, coordinates: [body.lng, body.lat] },
    created_by: body.browser_id,
  };
  const supabase = getServiceClient();
  const { error } = await supabase.from("access_points").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const feature: AccessPointFeature = {
    type: "Feature",
    geometry: row.geojson,
    properties: { id: row.id, kind, source: "user", label: null, level: null },
  };
  return NextResponse.json(feature, { headers: NO_STORE });
}

/** DELETE /api/access-points { id, browser_id }: remove a point you added yourself. */
export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { id?: string; browser_id?: string };
  if (!body.id || !body.browser_id) {
    return NextResponse.json({ error: "id and browser_id required" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("access_points")
    .delete()
    .eq("id", body.id)
    .eq("source", "user")
    .eq("created_by", body.browser_id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Not found, or not yours to remove" }, { status: 404 });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
