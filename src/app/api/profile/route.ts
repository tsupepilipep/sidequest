import { NextRequest, NextResponse } from "next/server";
import { ensureNickname, setNickname } from "@/lib/profiles";

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(err: unknown) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unknown error" },
    { status: 500 }
  );
}

/** GET /api/profile?browser_id=... -> { nickname }, creating one if needed. */
export async function GET(request: NextRequest) {
  const browserId = request.nextUrl.searchParams.get("browser_id");
  if (!browserId) {
    return NextResponse.json({ error: "browser_id query param required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ nickname: await ensureNickname(browserId) }, { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}

/** POST /api/profile { browser_id } -> { nickname }: shuffle to a new random name. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { browser_id?: string };
  if (!body.browser_id) {
    return NextResponse.json({ error: "browser_id required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      { nickname: await setNickname(body.browser_id, true) },
      { headers: NO_STORE }
    );
  } catch (err) {
    return fail(err);
  }
}
