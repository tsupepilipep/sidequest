"use client";

import { useEffect, useState } from "react";
import type { SegmentsGeoJSON } from "@/lib/types";

export function useSegments() {
  const [data, setData] = useState<SegmentsGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/segments")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((geojson: SegmentsGeoJSON) => {
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
