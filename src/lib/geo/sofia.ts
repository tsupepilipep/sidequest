/** Loose bounding box around Sofia, for validating user-added points. */
export const SOFIA_BBOX = { minLat: 42.55, maxLat: 42.85, minLng: 23.15, maxLng: 23.55 };

export function inSofia(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SOFIA_BBOX.minLat &&
    lat <= SOFIA_BBOX.maxLat &&
    lng >= SOFIA_BBOX.minLng &&
    lng <= SOFIA_BBOX.maxLng
  );
}

/** Approximate distance in metres between two points (fine at city scale). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** A ramp this close to an underpass counts as its ramp. */
export const RAMP_RADIUS_M = 60;
