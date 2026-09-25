"use client";

import { useEffect, useMemo, useState } from "react";
import { length } from "@turf/length";
import SegmentedControl from "./SegmentedControl";
import { Stat } from "./WalkSummaryCard";
import { useProfile } from "@/hooks/useProfile";
import { walkTotals, type Walk } from "@/hooks/useWalk";
import { formatDistance } from "@/lib/format";
import type {
  LeaderboardPeriod,
  LeaderboardResponse,
  LeaderboardRow,
  RatingValue,
  SegmentFeature,
} from "@/lib/types";

interface Props {
  browserId: string;
  walk: Walk | null;
  /** All segments, for turning this browser's rated ids into metres. */
  segments: SegmentFeature[];
  /** This browser's votes keyed by target id. */
  myRatings: Record<string, RatingValue>;
  onClose: () => void;
}

/** Nickname, current walk, all-time totals and the leaderboard. */
export default function StatsSheet({ browserId, walk, segments, myRatings, onClose }: Props) {
  const { nickname, shuffle, shuffling } = useProfile(browserId, true);
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  // One result per period, so switching back is instant and no reset is needed.
  const [boards, setBoards] = useState<Partial<Record<LeaderboardPeriod, LeaderboardResponse | Error>>>({});
  const loaded = boards[period];
  const board = loaded instanceof Error ? null : (loaded ?? null);
  const boardError = loaded instanceof Error ? loaded.message : null;

  const totals = useMemo(() => {
    const byId = new globalThis.Map<string, SegmentFeature>();
    for (const f of segments) byId.set(f.properties.id, f);
    let sidewalks = 0;
    let intersections = 0;
    let meters = 0;
    for (const id of Object.keys(myRatings)) {
      const f = byId.get(id);
      if (f) {
        sidewalks++;
        meters += length(f, { units: "kilometers" }) * 1000;
      } else {
        intersections++;
      }
    }
    return { sidewalks, intersections, meters };
  }, [segments, myRatings]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ period, browser_id: browserId });
    fetch(`/api/leaderboard?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: LeaderboardResponse) => {
        if (!cancelled) setBoards((prev) => ({ ...prev, [period]: data }));
      })
      .catch((err: Error) => {
        if (!cancelled) setBoards((prev) => ({ ...prev, [period]: err }));
      });
    return () => {
      cancelled = true;
    };
  }, [period, browserId]);

  const walkT = walk && walk.entries.length > 0 ? walkTotals(walk.entries) : null;

  return (
    <div className="absolute inset-0 z-[1100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-label="Your stats"
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between p-4 pb-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">You are</p>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{nickname ?? "…"}</h2>
              <button
                onClick={shuffle}
                disabled={shuffling || !nickname}
                title="Pick another name"
                aria-label="Shuffle nickname"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              >
                <svg
                  className={`h-4 w-4 ${shuffling ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h5M20 20v-5h-5M5.6 9A7 7 0 0118.4 8M18.4 15A7 7 0 015.6 16"
                  />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {walkT && (
            <section className="mt-2">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">This walk</h3>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat value={String(walkT.sidewalks)} label="sidewalks" />
                <Stat value={String(walkT.intersections)} label="corners" />
                <Stat value={formatDistance(walkT.meters)} label="mapped" />
              </dl>
              {walkT.firsts > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {walkT.firsts} of these had never been rated by anyone.
                </p>
              )}
            </section>
          )}

          <section className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">All time</h3>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat value={String(totals.sidewalks)} label="sidewalks" />
              <Stat value={String(totals.intersections)} label="corners" />
              <Stat value={formatDistance(totals.meters)} label="mapped" />
            </dl>
          </section>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Leaderboard</h3>
              <SegmentedControl<LeaderboardPeriod>
                label="Leaderboard period"
                value={period}
                onChange={setPeriod}
                className="shadow-none ring-1 ring-gray-200"
                options={[
                  { value: "week", label: "This week" },
                  { value: "all", label: "All time" },
                ]}
              />
            </div>
            {boardError && <p className="text-sm text-red-600">Could not load: {boardError}</p>}
            {!board && !boardError && <p className="py-4 text-center text-sm text-gray-400">Loading…</p>}
            {board && board.rows.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                Nobody has rated anything {period === "week" ? "this week" : "yet"}. Go first.
              </p>
            )}
            {board && board.rows.length > 0 && (
              <ol className="divide-y divide-gray-100">
                {board.rows.map((row) => (
                  <LeaderboardLine key={row.rank} row={row} />
                ))}
                {board.me && !board.rows.some((r) => r.me) && (
                  <>
                    <li className="py-1 text-center text-xs text-gray-400">…</li>
                    <LeaderboardLine row={board.me} />
                  </>
                )}
              </ol>
            )}
            {board && board.me === null && board.rows.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Rate something {period === "week" ? "this week " : ""}to appear here.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LeaderboardLine({ row }: { row: LeaderboardRow }) {
  const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
  return (
    <li
      className={`flex items-center gap-3 py-2 text-sm ${
        row.me ? "-mx-2 rounded-lg bg-amber-50 px-2 font-semibold text-gray-900" : "text-gray-700"
      }`}
    >
      <span className="w-6 shrink-0 text-center tabular-nums text-gray-400">{medal ?? row.rank}</span>
      <span className="flex-1 truncate">
        {row.nickname}
        {row.me && <span className="ml-1 text-xs font-normal text-amber-700">(you)</span>}
      </span>
      <span className="tabular-nums">{row.votes}</span>
      <span className="w-14 shrink-0 text-right tabular-nums text-gray-400">
        {formatDistance(row.meters)}
      </span>
    </li>
  );
}
