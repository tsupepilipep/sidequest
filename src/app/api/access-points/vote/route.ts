import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/access-points/vote { access_point_id, browser_id, closed: boolean | null }
 * Report an elevator or ramp as permanently closed (true), or withdraw (null).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { access_point_id?: string; browser_id?: string; closed?: boolean | null };
  if (!body.access_point_id || !body.browser_id || (body.closed !== null && typeof body.closed !== "boolean")) {
    return NextResponse.json({ error: "access_point_id, browser_id and closed (boolean or null) required" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { error } =
    body.closed === null
      ? await supabase
          .from("access_point_votes")
          .delete()
          .eq("access_point_id", body.access_point_id)
          .eq("browser_id", body.browser_id)
      : await supabase
          .from("access_point_votes")
          .upsert(
            { access_point_id: body.access_point_id, browser_id: body.browser_id, closed: body.closed },
            { onConflict: "access_point_id,browser_id" }
          );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
