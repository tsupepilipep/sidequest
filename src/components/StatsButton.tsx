"use client";

import { formatDistance } from "@/lib/format";
import type { WalkTotals } from "@/hooks/useWalk";

interface Props {
  /** Totals of the walk in progress, or null when nothing has been rated yet. */
  walk: WalkTotals | null;
  onClick: () => void;
}

/**
 * Opens the stats sheet. While a walk is in progress it doubles as a live
 * tally, so the count ticking up is visible without leaving the map.
 */
export default function StatsButton({ walk, onClick }: Props) {
  const rated = walk ? walk.sidewalks + walk.intersections : 0;
  return (
    <button
      onClick={onClick}
      title="Your stats and the leaderboard"
      aria-label={
        walk ? `This walk: ${rated} rated, ${formatDistance(walk.meters)}. Open stats.` : "Open stats"
      }
      className={`absolute right-4 top-[7.5rem] z-[1000] flex h-11 items-center gap-2 rounded-full bg-white text-sm font-semibold text-gray-700 shadow-lg transition-colors hover:bg-gray-50 ${
        walk ? "px-4" : "w-11 justify-center"
      }`}
    >
      <TrophyIcon className="h-5 w-5 text-amber-500" />
      {walk && (
        <span className="tabular-nums">
          {rated} · {formatDistance(walk.meters)}
        </span>
      )}
    </button>
  );
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4a1 1 0 00-1 1v1a3 3 0 003 3h1M17 6h3a1 1 0 011 1v1a3 3 0 01-3 3h-1"
      />
    </svg>
  );
}
