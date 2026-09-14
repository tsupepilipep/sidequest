"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserId } from "@/lib/browserId";
import type { MyRatingRow, RatingValue } from "@/lib/types";

const CACHE_KEY = "sidequest_my_ratings";

/** Keyed by target id. Segment and intersection ids never collide. */
type MyRatings = Record<string, RatingValue>;

function readCache(): MyRatings {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MyRatings) : {};
  } catch {
    return {};
  }
}

function writeCache(ratings: MyRatings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(ratings));
  } catch {
    // ignore: cache is a convenience only
  }
}

/**
 * The current browser's own ratings (sidewalks and intersections), keyed by
 * target id. Served from a localStorage cache immediately, then refreshed
 * from the server (the source of truth) once on mount.
 */
export function useMyRatings() {
  const browserId = useMemo(() => getBrowserId(), []);
  const [ratings, setRatings] = useState<MyRatings>(() =>
    typeof window === "undefined" ? {} : readCache()
  );
  const [loaded, setLoaded] = useState(false);
  // Bumps on every change so consumers can cheaply key re-renders on it.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!browserId) return;

    let cancelled = false;
    fetch(`/api/ratings?browser_id=${encodeURIComponent(browserId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((rows: MyRatingRow[]) => {
        if (cancelled) return;
        const next: MyRatings = {};
        for (const row of rows) next[row.id] = row.rating;
        setRatings(next);
        writeCache(next);
        setVersion((v) => v + 1);
      })
      .catch(() => {
        // Keep whatever the cache had.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [browserId]);

  const get = useCallback(
    (targetId: string): RatingValue | null => ratings[targetId] ?? null,
    [ratings]
  );

  const set = useCallback((targetId: string, rating: RatingValue) => {
    setRatings((prev) => {
      const next = { ...prev, [targetId]: rating };
      writeCache(next);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  return { browserId, ratings, loaded, version, get, set };
}
