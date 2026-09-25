import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST /api/underpasses/vote { underpass_id, browser_id, has_ramp: boolean | null }
 * One vote per browser per underpass; null withdraws the vote.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { underpass_id?: string; browser_id?: string; has_ramp?: boolean | null };
  if (!body.underpass_id || !body.browser_id || (body.has_ramp !== null && typeof body.has_ramp !== "boolean")) {
    return NextResponse.json({ error: "underpass_id, browser_id and has_ramp (boolean or null) required" }, { status: 400 });
  }
  const supabase = getServiceClient();
  const { error } =
    body.has_ramp === null
      ? await supabase
          .from("underpass_votes")
          .delete()
          .eq("underpass_id", body.underpass_id)
          .eq("browser_id", body.browser_id)
      : await supabase
          .from("underpass_votes")
          .upsert(
            { underpass_id: body.underpass_id, browser_id: body.browser_id, has_ramp: body.has_ramp },
            { onConflict: "underpass_id,browser_id" }
          );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
