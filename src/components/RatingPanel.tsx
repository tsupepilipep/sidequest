"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { useRating } from "@/hooks/useRating";
import { getBrowserId } from "@/lib/browserId";
import type { RatedProperties, RatingValue, Selected } from "@/lib/types";

const RATING_OPTIONS: { value: RatingValue; label: string; emoji: string; color: string }[] = [
  { value: 0, label: "Terrible", emoji: "🔴", color: "bg-red-500 hover:bg-red-600" },
  { value: 1, label: "Passable", emoji: "🟡", color: "bg-yellow-500 hover:bg-yellow-600" },
  { value: 2, label: "Good", emoji: "🟢", color: "bg-green-500 hover:bg-green-600" },
];

function formatMedian(value: number | null): string {
  if (value === null) return "No ratings yet";
  return value.toFixed(1);
}

/** Human-readable title for whatever is selected. */
export function selectedTitle(selected: Selected): string {
  if (selected.kind === "segment") {
    return selected.feature.properties.name || "Unnamed street";
  }
  const names = selected.feature.properties.street_names;
  if (names.length === 0) return "Unnamed corner";
  if (names.length === 1) return `Corner on ${names[0]}`;
  return names.join(" × ");
}

interface Props {
  selected: Selected;
  /** This browser's existing vote for the selected target, if any. */
  myRating: RatingValue | null;
  onClose: () => void;
  onRated: (
    targetId: string,
    kind: Selected["kind"],
    newRating: RatingValue,
    previousRating: RatingValue | null
  ) => void;
}

export default function RatingPanel({ selected, myRating, onClose, onRated }: Props) {
  const { submitRating, submitting, error } = useRating();
  const { id, median_rating, rating_count } = selected.feature.properties;
  const myOption = RATING_OPTIONS.find((o) => o.value === myRating);
  const kindLabel = selected.kind === "segment" ? "Sidewalk" : "Intersection";

  const handleRate = async (rating: RatingValue) => {
    // Tapping the vote you already gave is a no-op.
    if (rating === myRating) return;

    const success = await submitRating({
      ...(selected.kind === "segment" ? { segment_id: id } : { intersection_id: id }),
      browser_id: getBrowserId(),
      rating,
    });

    if (success) {
      onRated(id, selected.kind, rating, myRating);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl bg-white p-4 shadow-2xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2 sm:rounded-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{kindLabel}</p>
          <h2 className="text-lg font-semibold text-gray-900">{selectedTitle(selected)}</h2>
          <p className="text-sm text-gray-500">
            Rating: {formatMedian(median_rating)} · {rating_count} vote{rating_count !== 1 ? "s" : ""}
          </p>
          {myOption && (
            <p className="mt-1 text-xs text-gray-500">
              You rated this <span className="font-semibold text-gray-700">{myOption.label}</span>.
              Tap another to change it.
            </p>
          )}
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

      <div className="flex gap-2">
        {RATING_OPTIONS.map((opt) => {
          const isMine = opt.value === myRating;
          const dimmed = myRating !== null && !isMine;
          return (
            <button
              key={opt.value}
              onClick={() => handleRate(opt.value)}
              disabled={submitting}
              aria-pressed={isMine}
              className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium text-white transition-all ${opt.color} disabled:opacity-50 ${
                isMine ? "ring-2 ring-gray-900 ring-offset-2" : ""
              } ${dimmed ? "opacity-60" : ""}`}
            >
              <span className="block text-lg">{isMine ? "✓" : opt.emoji}</span>
              {opt.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">Error: {error}</p>
      )}
    </div>
  );
}

/**
 * Optimistically update a feature collection after a rating. A first vote
 * adds to the count; changing an existing vote swaps it out and leaves the
 * count alone. The median is approximated with a weighted mean until reload.
 */
export function optimisticUpdate<G extends Geometry, P extends RatedProperties>(
  collection: FeatureCollection<G, P>,
  targetId: string,
  newRating: RatingValue,
  previousRating: RatingValue | null
): FeatureCollection<G, P> {
  return {
    ...collection,
    features: collection.features.map((f) => {
      if (f.properties.id !== targetId) return f;
      const oldCount = f.properties.rating_count;
      const oldMedian = f.properties.median_rating;

      let newCount: number;
      let approxMedian: number;
      if (previousRating === null || oldCount === 0) {
        newCount = oldCount + 1;
        approxMedian =
          oldMedian === null ? newRating : (oldMedian * oldCount + newRating) / newCount;
      } else {
        newCount = oldCount;
        approxMedian =
          oldMedian === null
            ? newRating
            : (oldMedian * oldCount - previousRating + newRating) / oldCount;
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          median_rating: Math.min(2, Math.max(0, approxMedian)),
          rating_count: newCount,
        },
      };
    }),
  };
}
