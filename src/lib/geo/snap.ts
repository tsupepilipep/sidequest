import type { IntersectionFeature, SegmentFeature } from "@/lib/types";

/** Metres per degree of latitude; longitude is scaled by cos(lat) at city scale. */
const M_PER_DEG = 111_320;

interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

// Bounding boxes are computed once per segment array. The array identity only
// changes when data is (re)loaded or optimistically updated after a vote, and
// even then the geometry is shared, so this is cheap to rebuild.
const boundsCache = new WeakMap<SegmentFeature[], Bounds[]>();

function boundsFor(segments: SegmentFeature[]): Bounds[] {
  let bounds = boundsCache.get(segments);
  if (bounds) return bounds;
  bounds = segments.map((segment) => {
    const b: Bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
    for (const [lng, lat] of segment.geometry.coordinates) {
      if (lng < b.minLng) b.minLng = lng;
      if (lng > b.maxLng) b.maxLng = lng;
      if (lat < b.minLat) b.minLat = lat;
      if (lat > b.maxLat) b.maxLat = lat;
    }
    return b;
  });
  boundsCache.set(segments, bounds);
  return bounds;
}

/** Squared distance in metres² from point p to the segment a–b, all in local metres. */
function pointToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Find the nearest segment to a point on the map.
 * Returns null when nothing is within `maxDistanceKm`.
 *
 * Runs on every GPS fix in live mode, so it has to be cheap: an equirectangular
 * projection around the query point is accurate to well under a metre at city
 * scale, and a bounding-box test throws out almost every segment before any
 * per-vertex work is done.
 */
export function findNearestSegment(
  lat: number,
  lng: number,
  segments: SegmentFeature[],
  maxDistanceKm = 0.05 // 50 meters
): SegmentFeature | null {
  const maxM = maxDistanceKm * 1000;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const kx = M_PER_DEG * cosLat;
  const ky = M_PER_DEG;
  const padLng = maxM / kx;
  const padLat = maxM / ky;

  const bounds = boundsFor(segments);
  let nearest: SegmentFeature | null = null;
  let minSq = maxM * maxM;

  for (let i = 0; i < segments.length; i++) {
    const b = bounds[i];
    if (
      lng < b.minLng - padLng ||
      lng > b.maxLng + padLng ||
      lat < b.minLat - padLat ||
      lat > b.maxLat + padLat
    ) {
      continue;
    }
    const coords = segments[i].geometry.coordinates;
    for (let j = 1; j < coords.length; j++) {
      const [alng, alat] = coords[j - 1];
      const [blng, blat] = coords[j];
      const dSq = pointToSegmentSq(
        0,
        0,
        (alng - lng) * kx,
        (alat - lat) * ky,
        (blng - lng) * kx,
        (blat - lat) * ky
      );
      if (dSq < minSq) {
        minSq = dSq;
        nearest = segments[i];
      }
    }
  }

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
