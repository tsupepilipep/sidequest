"use client";

import { walkTotals, type Walk } from "@/hooks/useWalk";
import { formatDistance, plural } from "@/lib/format";

interface Props {
  walk: Walk;
  onClose: () => void;
}

function whenLabel(startedAt: number): string {
  const start = new Date(startedAt);
  const days = Math.floor((Date.now() - start.setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Today's walk";
  if (days === 1) return "Yesterday's walk";
  return `Your walk on ${new Date(startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** Shown once, on the next app start after a walk has gone quiet. */
export default function WalkSummaryCard({ walk, onClose }: Props) {
  const t = walkTotals(walk.entries);
  const rated = t.sidewalks + t.intersections;
  return (
    <div className="absolute inset-0 z-[1100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-label="Walk summary"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{whenLabel(walk.startedAt)}</p>
        <h2 className="mt-1 text-2xl font-bold text-gray-900">
          {t.firsts > 0 ? "New ground covered" : "Nice walk"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          You rated {plural(rated, "place")}
          {t.firsts > 0 && (
            <>
              , and <span className="font-semibold text-gray-900">{t.firsts}</span> of them had
              never been rated by anyone
            </>
          )}
          .
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={String(t.sidewalks)} label="sidewalks" />
          <Stat value={String(t.intersections)} label="corners" />
          <Stat value={formatDistance(t.meters)} label="mapped" />
        </dl>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Keep walking
        </button>
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-2 py-3">
      <dd className="text-xl font-bold tabular-nums text-gray-900">{value}</dd>
      <dt className="text-xs text-gray-500">{label}</dt>
    </div>
  );
}
