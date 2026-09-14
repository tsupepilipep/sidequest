import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import type { RatingInput } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body: RatingInput = await request.json();

  if (
    !body.segment_id ||
    !body.browser_id ||
    body.rating === undefined ||
    ![0, 1, 2].includes(body.rating)
  ) {
    return NextResponse.json(
      { error: "Invalid input. Required: segment_id, browser_id, rating (0-2)" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  // Upsert rating (one per browser per segment)
  const { error: ratingError } = await supabase.from("ratings").upsert(
    {
      segment_id: body.segment_id,
      browser_id: body.browser_id,
      rating: body.rating,
      side: body.side ?? null,
    },
    { onConflict: "segment_id,browser_id" }
  );

  if (ratingError) {
    return NextResponse.json({ error: ratingError.message }, { status: 500 });
  }

  // Recompute median for this segment
  const { error: rpcError } = await supabase.rpc("update_segment_median", {
    p_segment_id: body.segment_id,
  });

  if (rpcError) {
    console.error("Error updating median:", rpcError);
    // Non-fatal — the rating was saved
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const segmentId = request.nextUrl.searchParams.get("segment_id");

  if (!segmentId) {
    return NextResponse.json(
      { error: "segment_id query param required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("ratings")
    .select("*")
    .eq("segment_id", segmentId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
