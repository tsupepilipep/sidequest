import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import type { SegmentFeature } from "@/lib/types";

/**
 * Find the nearest segment to a clicked point on the map.
 * Returns the segment feature and distance in km.
 */
export function findNearestSegment(
  lat: number,
  lng: number,
  segments: SegmentFeature[],
  maxDistanceKm = 0.05 // 50 meters
): SegmentFeature | null {
  const clickPoint = point([lng, lat]);
  let nearest: SegmentFeature | null = null;
  let minDist = Infinity;

  for (const segment of segments) {
    const line = lineString(segment.geometry.coordinates);
    const snapped = nearestPointOnLine(line, clickPoint, {
      units: "kilometers",
    });
    const dist = snapped.properties.dist ?? Infinity;

    if (dist < minDist) {
      minDist = dist;
      nearest = segment;
    }
  }

  if (minDist > maxDistanceKm) return null;
  return nearest;
}
