"use client";

import { useEffect, useState } from "react";
import type { IntersectionsGeoJSON } from "@/lib/types";

export function useIntersections() {
  const [data, setData] = useState<IntersectionsGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/intersections")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((geojson: IntersectionsGeoJSON) => {
        setData(geojson);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, setData, loading, error };
}
