import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import type { IntersectionFeature, SegmentFeature } from "@/lib/types";

/**
 * Find the nearest segment to a point on the map.
 * Returns null when nothing is within `maxDistanceKm`.
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

/**
 * Find the nearest intersection to a point on the map.
 * Returns null when nothing is within `maxDistanceKm`.
 */
export function findNearestIntersection(
  lat: number,
  lng: number,
  intersections: IntersectionFeature[],
  maxDistanceKm = 0.06 // 60 meters: roughly half a short block
): IntersectionFeature | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let nearest: IntersectionFeature | null = null;
  let minDistKm = Infinity;

  for (const feature of intersections) {
    const [flng, flat] = feature.geometry.coordinates;
    const dLat = (flat - lat) * 111.32;
    const dLng = (flng - lng) * 111.32 * cosLat;
    const dist = Math.hypot(dLat, dLng);
    if (dist < minDistKm) {
      minDistKm = dist;
      nearest = feature;
    }
  }

  if (minDistKm > maxDistanceKm) return null;
  return nearest;
}
