import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { ensureNickname } from "@/lib/profiles";
import type { LeaderboardPeriod, LeaderboardResponse, LeaderboardRow } from "@/lib/types";

const TOP_N = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface RankedRow {
  browser_id: string;
  votes: number;
  meters: number;
}

/**
 * GET /api/leaderboard?period=week|all&browser_id=...
 *
 * Top raters by number of targets rated, plus the caller's own rank if they
 * are not in the top. Browser ids are the only credential a user has, so
 * they are never returned: rows only carry a nickname and an `me` flag.
 */
export async function GET(request: NextRequest) {
  const period: LeaderboardPeriod =
    request.nextUrl.searchParams.get("period") === "week" ? "week" : "all";
  const browserId = request.nextUrl.searchParams.get("browser_id");

  const supabase = getServiceClient();
  const since = period === "week" ? new Date(Date.now() - WEEK_MS).toISOString() : null;
  const { data, error } = await supabase.rpc("leaderboard", { p_since: since });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranked = (data as RankedRow[]).map((r) => ({
    ...r,
    votes: Number(r.votes),
    meters: Number(r.meters),
  }));

  const myIndex = browserId ? ranked.findIndex((r) => r.browser_id === browserId) : -1;
  const shown = ranked.slice(0, TOP_N);
  if (myIndex >= TOP_N) shown.push(ranked[myIndex]);

  // Everyone shown gets a name, including raters who never opened their stats.
  const nicknames = new Map<string, string>();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("browser_id, nickname")
    .in("browser_id", shown.map((r) => r.browser_id));
  for (const p of profiles ?? []) nicknames.set(p.browser_id as string, p.nickname as string);
  try {
    for (const r of shown) {
      if (!nicknames.has(r.browser_id)) nicknames.set(r.browser_id, await ensureNickname(r.browser_id));
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }

  const toRow = (r: RankedRow, index: number): LeaderboardRow => ({
    rank: index + 1,
    nickname: nicknames.get(r.browser_id) ?? "Anonymous",
    votes: r.votes,
    meters: Math.round(r.meters),
    me: r.browser_id === browserId,
  });

  const body: LeaderboardResponse = {
    period,
    rows: shown.slice(0, TOP_N).map(toRow),
    me: myIndex >= 0 ? toRow(ranked[myIndex], myIndex) : null,
    raters: ranked.length,
  };
  // The `me` flag makes the response per-browser.
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
