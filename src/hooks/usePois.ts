"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AccessKind,
  AccessPointFeature,
  AccessPointsGeoJSON,
  UnderpassFeature,
  UnderpassesGeoJSON,
} from "@/lib/types";

const MINE_KEY = "sidequest_my_points";

function readMine(): Set<string> {
  try {
    const raw = localStorage.getItem(MINE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeMine(ids: Set<string>) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...ids]));
  } catch {
    // cache only; the server still checks ownership
  }
}

async function post<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Elevators, ramps and underpasses, plus the actions on them: add a point,
 * remove one you added, vote on an underpass. Ids of points this browser
 * added are remembered locally so the panel can offer "Remove".
 */
export function usePois(browserId: string) {
  const [access, setAccess] = useState<AccessPointsGeoJSON | null>(null);
  const [underpasses, setUnderpasses] = useState<UnderpassesGeoJSON | null>(null);
  const [mine, setMine] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readMine()
  );

  const loadAccess = useCallback(() => {
    if (!browserId) return;
    fetch(`/api/access-points?browser_id=${encodeURIComponent(browserId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((geojson: AccessPointsGeoJSON) => setAccess(geojson))
      .catch((err) => console.error("Error loading access points:", err));
  }, [browserId]);

  const loadUnderpasses = useCallback(() => {
    if (!browserId) return;
    fetch(`/api/underpasses?browser_id=${encodeURIComponent(browserId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((geojson: UnderpassesGeoJSON) => setUnderpasses(geojson))
      .catch((err) => console.error("Error loading underpasses:", err));
  }, [browserId]);

  useEffect(() => {
    loadAccess();
    loadUnderpasses();
  }, [loadAccess, loadUnderpasses]);

  const remember = useCallback((id: string, keep: boolean) => {
    setMine((prev) => {
      const next = new Set(prev);
      if (keep) next.add(id);
      else next.delete(id);
      writeMine(next);
      return next;
    });
  }, []);

  const addAccessPoint = useCallback(
    async (kind: AccessKind, lat: number, lng: number): Promise<AccessPointFeature> => {
      const feature = await post<AccessPointFeature>("/api/access-points", { kind, lat, lng, browser_id: browserId });
      setAccess((prev) => ({ type: "FeatureCollection", features: [...(prev?.features ?? []), feature] }));
      remember(feature.properties.id, true);
      // A new ramp may answer a nearby underpass's question.
      if (kind === "ramp") loadUnderpasses();
      return feature;
    },
    [browserId, remember, loadUnderpasses]
  );

  const removeAccessPoint = useCallback(
    async (id: string) => {
      await post("/api/access-points", { id, browser_id: browserId }, "DELETE");
      setAccess((prev) =>
        prev ? { ...prev, features: prev.features.filter((f) => f.properties.id !== id) } : prev
      );
      remember(id, false);
      loadUnderpasses();
    },
    [browserId, remember, loadUnderpasses]
  );

  const addUnderpass = useCallback(
    async (lat: number, lng: number): Promise<UnderpassFeature> => {
      const feature = await post<UnderpassFeature>("/api/underpasses", { lat, lng, browser_id: browserId });
      setUnderpasses((prev) => ({ type: "FeatureCollection", features: [...(prev?.features ?? []), feature] }));
      remember(feature.properties.id, true);
      return feature;
    },
    [browserId, remember]
  );

  const removeUnderpass = useCallback(
    async (id: string) => {
      await post("/api/underpasses", { id, browser_id: browserId }, "DELETE");
      setUnderpasses((prev) =>
        prev ? { ...prev, features: prev.features.filter((f) => f.properties.id !== id) } : prev
      );
      remember(id, false);
    },
    [browserId, remember]
  );

  /** Report an elevator or ramp as permanently closed; null withdraws. Returns the updated feature. */
  const voteAccessClosed = useCallback(
    async (id: string, closed: boolean | null): Promise<AccessPointFeature | null> => {
      await post("/api/access-points/vote", { access_point_id: id, browser_id: browserId, closed });
      let updated: AccessPointFeature | null = null;
      setAccess((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          features: prev.features.map((f) => {
            if (f.properties.id !== id) return f;
            const p = f.properties;
            const count = p.closed_votes - (p.my_closed === true ? 1 : 0) + (closed === true ? 1 : 0);
            updated = { ...f, properties: { ...p, closed_votes: count, my_closed: closed } };
            return updated;
          }),
        };
      });
      return updated;
    },
    [browserId]
  );

  /** Vote on an underpass; null withdraws. Returns the updated feature. */
  const voteUnderpass = useCallback(
    async (id: string, hasRamp: boolean | null): Promise<UnderpassFeature | null> => {
      await post("/api/underpasses/vote", { underpass_id: id, browser_id: browserId, has_ramp: hasRamp });
      let updated: UnderpassFeature | null = null;
      setUnderpasses((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          features: prev.features.map((f) => {
            if (f.properties.id !== id) return f;
            const p = f.properties;
            const prevVote = p.my_vote;
            let no = p.no_ramp_votes - (prevVote === false ? 1 : 0);
            let yes = p.ramp_votes - (prevVote === true ? 1 : 0);
            if (hasRamp === false) no++;
            if (hasRamp === true) yes++;
            updated = { ...f, properties: { ...p, no_ramp_votes: no, ramp_votes: yes, my_vote: hasRamp } };
            return updated;
          }),
        };
      });
      return updated;
    },
    [browserId]
  );

  return {
    access,
    underpasses,
    isMine: (id: string) => mine.has(id),
    addAccessPoint,
    removeAccessPoint,
    addUnderpass,
    removeUnderpass,
    voteUnderpass,
    voteAccessClosed,
  };
}
