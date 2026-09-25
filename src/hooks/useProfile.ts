"use client";

import { useCallback, useEffect, useState } from "react";

const CACHE_KEY = "sidequest_nickname";

/** This browser's nickname: cached locally, fetched (and created) on demand. */
export function useProfile(browserId: string, enabled: boolean) {
  const [nickname, setNickname] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CACHE_KEY);
    } catch {
      return null;
    }
  });
  const [shuffling, setShuffling] = useState(false);

  const remember = useCallback((name: string) => {
    setNickname(name);
    try {
      localStorage.setItem(CACHE_KEY, name);
    } catch {
      // cache only
    }
  }, []);

  useEffect(() => {
    if (!enabled || !browserId || nickname) return;
    let cancelled = false;
    fetch(`/api/profile?browser_id=${encodeURIComponent(browserId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { nickname: string }) => {
        if (!cancelled) remember(data.nickname);
      })
      .catch(() => {
        // Stay nameless until the next try.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, browserId, nickname, remember]);

  const shuffle = useCallback(async () => {
    if (!browserId || shuffling) return;
    setShuffling(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser_id: browserId }),
      });
      if (res.ok) remember(((await res.json()) as { nickname: string }).nickname);
    } finally {
      setShuffling(false);
    }
  }, [browserId, shuffling, remember]);

  return { nickname, shuffle, shuffling };
}
