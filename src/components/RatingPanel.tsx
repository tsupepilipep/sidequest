"use client";

import { useRating } from "@/hooks/useRating";
import type { SegmentFeature, SegmentsGeoJSON } from "@/lib/types";

const RATING_OPTIONS = [
  { value: 0 as const, label: "Terrible", emoji: "🔴", color: "bg-red-500 hover:bg-red-600" },
  { value: 1 as const, label: "Passable", emoji: "🟡", color: "bg-yellow-500 hover:bg-yellow-600" },
  { value: 2 as const, label: "Good", emoji: "🟢", color: "bg-green-500 hover:bg-green-600" },
];

function getBrowserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("sidequest_browser_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sidequest_browser_id", id);
  }
  return id;
}

function formatMedian(value: number | null): string {
  if (value === null) return "No ratings yet";
  return value.toFixed(1);
}

interface Props {
  segment: SegmentFeature;
  onClose: () => void;
  onRated: (segmentId: string, newRating: number) => void;
}

export default function RatingPanel({ segment, onClose, onRated }: Props) {
  const { submitRating, submitting, error } = useRating();
  const { name, median_rating, rating_count, id } = segment.properties;

  const handleRate = async (rating: 0 | 1 | 2) => {
    const browserId = getBrowserId();
    const success = await submitRating({
      segment_id: id,
      browser_id: browserId,
      rating,
    });

    if (success) {
      onRated(id, rating);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl bg-white p-4 shadow-2xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2 sm:rounded-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {name || "Unnamed street"}
          </h2>
          <p className="text-sm text-gray-500">
            Rating: {formatMedian(median_rating)} · {rating_count} vote{rating_count !== 1 ? "s" : ""}
          </p>
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

      <p className="mb-3 text-sm text-gray-600">How is this sidewalk?</p>

      <div className="flex gap-2">
        {RATING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleRate(opt.value)}
            disabled={submitting}
            className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium text-white transition-colors ${opt.color} disabled:opacity-50`}
          >
            <span className="block text-lg">{opt.emoji}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">Error: {error}</p>
      )}
    </div>
  );
}

/** Helper to optimistically update the GeoJSON after a rating */
export function optimisticUpdate(
  geojson: SegmentsGeoJSON,
  segmentId: string,
  newRating: number
): SegmentsGeoJSON {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      if (f.properties.id !== segmentId) return f;
      const oldCount = f.properties.rating_count;
      const oldMedian = f.properties.median_rating;
      // Simple approximation: weight new rating into existing median
      const approxMedian =
        oldMedian === null
          ? newRating
          : (oldMedian * oldCount + newRating) / (oldCount + 1);
      return {
        ...f,
        properties: {
          ...f.properties,
          median_rating: approxMedian,
          rating_count: oldCount + 1,
        },
      };
    }),
  };
}
