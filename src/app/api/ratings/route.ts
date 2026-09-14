import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import type { MyRatingRow, RatingInput } from "@/lib/types";

/**
 * POST /api/ratings
 * Body: { segment_id | intersection_id, browser_id, rating }
 * One vote per browser per target; a repeat vote replaces the previous one.
 */
export async function POST(request: NextRequest) {
  const body: RatingInput = await request.json();

  const hasSegment = typeof body.segment_id === "string" && body.segment_id.length > 0;
  const hasIntersection =
    typeof body.intersection_id === "string" && body.intersection_id.length > 0;

  if (
    hasSegment === hasIntersection || // exactly one target
    !body.browser_id ||
    body.rating === undefined ||
    ![0, 1, 2].includes(body.rating)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid input. Required: exactly one of segment_id / intersection_id, browser_id, rating (0-2)",
      },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  if (hasSegment) {
    const { error } = await supabase.from("ratings").upsert(
      {
        segment_id: body.segment_id,
        browser_id: body.browser_id,
        rating: body.rating,
        side: body.side ?? null,
      },
      { onConflict: "segment_id,browser_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { error: rpcError } = await supabase.rpc("update_segment_median", {
      p_segment_id: body.segment_id,
    });
    if (rpcError) console.error("Error updating segment median:", rpcError);
  } else {
    const { error } = await supabase.from("intersection_ratings").upsert(
      {
        intersection_id: body.intersection_id,
        browser_id: body.browser_id,
        rating: body.rating,
      },
      { onConflict: "intersection_id,browser_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { error: rpcError } = await supabase.rpc("update_intersection_median", {
      p_intersection_id: body.intersection_id,
    });
    if (rpcError) console.error("Error updating intersection median:", rpcError);
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/ratings?segment_id=...  -> all ratings for one segment
 * GET /api/ratings?browser_id=...  -> this browser's own votes on sidewalks and
 *                                     intersections, as [{ id, kind, rating }]
 */
export async function GET(request: NextRequest) {
  const segmentId = request.nextUrl.searchParams.get("segment_id");
  const browserId = request.nextUrl.searchParams.get("browser_id");

  if (!segmentId && !browserId) {
    return NextResponse.json(
      { error: "segment_id or browser_id query param required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  if (browserId) {
    const [segs, ints] = await Promise.all([
      supabase.from("ratings").select("segment_id, rating").eq("browser_id", browserId),
      supabase
        .from("intersection_ratings")
        .select("intersection_id, rating")
        .eq("browser_id", browserId),
    ]);

    if (segs.error) return NextResponse.json({ error: segs.error.message }, { status: 500 });
    // Intersections are optional until their migration has been applied;
    // sidewalk votes must keep working regardless.
    if (ints.error) console.error("Error loading intersection ratings:", ints.error.message);

    const rows: MyRatingRow[] = [
      ...segs.data.map((r) => ({ id: r.segment_id as string, kind: "segment" as const, rating: r.rating as MyRatingRow["rating"] })),
      ...(ints.data ?? []).map((r) => ({ id: r.intersection_id as string, kind: "intersection" as const, rating: r.rating as MyRatingRow["rating"] })),
    ];

    // A person's own votes must not be cached by shared caches.
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { data, error } = await supabase
    .from("ratings")
    .select("*")
    .eq("segment_id", segmentId!)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
