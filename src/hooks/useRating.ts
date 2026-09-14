"use client";

import { useState, useCallback } from "react";
import type { RatingInput } from "@/lib/types";

export function useRating() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRating = useCallback(async (input: RatingInput) => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitRating, submitting, error };
}
