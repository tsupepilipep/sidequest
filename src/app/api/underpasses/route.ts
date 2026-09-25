import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceClient } from "@/lib/supabase/server";
import { distanceM, inSofia, RAMP_RADIUS_M } from "@/lib/geo/sofia";
import type { UnderpassFeature, UnderpassRow, UnderpassesGeoJSON } from "@/lib/types";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/underpasses?browser_id=... -> GeoJSON of underpasses with vote
 * tallies, whether a ramp point sits nearby, and the caller's own vote.
 */
export async function GET(request: NextRequest) {
  const browserId = request.nextUrl.searchParams.get("browser_id");
  const supabase = getServiceClient();

  const [ups, votes, ramps] = await Promise.all([
    supabase.from("underpasses").select("id, source, name, geojson").order("id"),
    supabase.from("underpass_votes").select("underpass_id, browser_id, has_ramp"),
    supabase.from("access_points").select("geojson").eq("kind", "ramp"),
  ]);
  const failed = ups.error ?? votes.error ?? ramps.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const rampPoints = (ramps.data ?? []).map((r) => {
    const [lng, lat] = (r.geojson as { coordinates: [number, number] }).coordinates;
    return { lat, lng };
  });
  const tally = new Map<string, { no: number; yes: number; mine: boolean | null }>();
  for (const v of votes.data ?? []) {
    const t = tally.get(v.underpass_id as string) ?? { no: 0, yes: 0, mine: null };
    if (v.has_ramp) t.yes++;
    else t.no++;
    if (browserId && v.browser_id === browserId) t.mine = v.has_ramp as boolean;
    tally.set(v.underpass_id as string, t);
  }

  const features: UnderpassFeature[] = (ups.data as UnderpassRow[]).map((row) => {
    const [lng, lat] = row.geojson.coordinates;
    const t = tally.get(row.id) ?? { no: 0, yes: 0, mine: null };
    return {
      type: "Feature" as const,
      geometry: row.geojson,
      properties: {
        id: row.id,
        source: row.source,
        name: row.name,
        has_ramp_nearby: rampPoints.some((p) => distanceM(p, { lat, lng }) <= RAMP_RADIUS_M),
        no_ramp_votes: t.no,
        ramp_votes: t.yes,
        my_vote: t.mine,
      },
    };
  });
  const geojson: UnderpassesGeoJSON = { type: "FeatureCollection", features };
  return NextResponse.json(geojson, { headers: NO_STORE });
}

/** POST /api/underpasses { lat, lng, browser_id } -> the new underpass feature. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { lat?: number; lng?: number; browser_id?: string };
  if (!body.browser_id || typeof body.lat !== "number" || typeof body.lng !== "number" || !inSofia(body.lat, body.lng)) {
    return NextResponse.json({ error: "Required: lat/lng inside Sofia, browser_id" }, { status: 400 });
  }
  const row = {
    id: `u_${randomUUID()}`,
    source: "user" as const,
    name: null,
    geojson: { type: "Point" as const, coordinates: [body.lng, body.lat] },
    created_by: body.browser_id,
  };
  const supabase = getServiceClient();
  const { error } = await supabase.from("underpasses").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const feature: UnderpassFeature = {
    type: "Feature",
    geometry: row.geojson,
    properties: {
      id: row.id,
      source: "user",
      name: null,
      has_ramp_nearby: false,
      no_ramp_votes: 0,
      ramp_votes: 0,
      my_vote: null,
    },
  };
  return NextResponse.json(feature, { headers: NO_STORE });
}

/** DELETE /api/underpasses { id, browser_id }: remove an underpass you added yourself. */
export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { id?: string; browser_id?: string };
  if (!body.id || !body.browser_id) {
    return NextResponse.json({ error: "id and browser_id required" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("underpasses")
    .delete()
    .eq("id", body.id)
    .eq("source", "user")
    .eq("created_by", body.browser_id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Not found, or not yours to remove" }, { status: 404 });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
