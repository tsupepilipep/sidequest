import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase/server";
import { inSofia } from "@/lib/geo/sofia";
import type { AccessPointFeature, AccessPointRow, AccessPointsGeoJSON } from "@/lib/types";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/access-points?browser_id=... -> GeoJSON of elevators and ramps
 * (OSM and user-added) with "permanently closed" report counts and the
 * caller's own report.
 */
export async function GET(request: NextRequest) {
  const browserId = request.nextUrl.searchParams.get("browser_id");
  const supabase = getServiceClient();
  const [points, votes] = await Promise.all([
    supabase.from("access_points").select("id, kind, source, label, level, geojson").order("id"),
    supabase.from("access_point_votes").select("access_point_id, browser_id, closed"),
  ]);
  const failed = points.error ?? votes.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const tally = new Map<string, { closed: number; mine: boolean | null }>();
  for (const v of votes.data ?? []) {
    const t = tally.get(v.access_point_id as string) ?? { closed: 0, mine: null };
    if (v.closed) t.closed++;
    if (browserId && v.browser_id === browserId) t.mine = v.closed as boolean;
    tally.set(v.access_point_id as string, t);
  }

  const features: AccessPointFeature[] = (points.data as AccessPointRow[]).map((row) => {
    const t = tally.get(row.id) ?? { closed: 0, mine: null };
    return {
      type: "Feature" as const,
      geometry: row.geojson,
      properties: {
        id: row.id,
        kind: row.kind,
        source: row.source,
        label: row.label,
        level: row.level,
        closed_votes: t.closed,
        my_closed: t.mine,
      },
    };
  });
  const geojson: AccessPointsGeoJSON = { type: "FeatureCollection", features };
  return NextResponse.json(geojson, { headers: NO_STORE });
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
    properties: { id: row.id, kind, source: "user", label: null, level: null, closed_votes: 0, my_closed: null },
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
