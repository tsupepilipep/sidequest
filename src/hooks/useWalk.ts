"use client";

import { useCallback, useState } from "react";

/**
 * A "walk" is a run of first-time ratings with no gap longer than
 * WALK_GAP_MS between them. Nothing in the UI ends a walk explicitly:
 * toggling live mode off to tap a missed street is still the same walk.
 * A walk that has gone quiet is closed the next time the app starts, and
 * its summary is shown once, as a welcome-back card.
 */
const WALK_GAP_MS = 30 * 60 * 1000;
const WALK_KEY = "sidequest_walk";
const SUMMARY_KEY = "sidequest_walk_summary";

export interface WalkEntry {
  id: string;
  kind: "segment" | "intersection";
  /** Nobody had rated this target before. */
  first: boolean;
  /** Length of the sidewalk in metres; 0 for intersections. */
  meters: number;
}

export interface Walk {
  startedAt: number;
  lastAt: number;
  entries: WalkEntry[];
}

export interface WalkTotals {
  sidewalks: number;
  intersections: number;
  firsts: number;
  meters: number;
}

export function walkTotals(entries: WalkEntry[]): WalkTotals {
  const t: WalkTotals = { sidewalks: 0, intersections: 0, firsts: 0, meters: 0 };
  for (const e of entries) {
    if (e.kind === "segment") t.sidewalks++;
    else t.intersections++;
    if (e.first) t.firsts++;
    t.meters += e.meters;
  }
  return t;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; the walk just won't survive a reload
  }
}

function isStale(walk: Walk, now: number): boolean {
  return now - walk.lastAt > WALK_GAP_MS;
}

interface WalkState {
  walk: Walk | null;
  /** A finished walk waiting to be shown, kept until dismissed. */
  summary: Walk | null;
}

/**
 * Start-up state: a stale walk becomes the pending summary (unless one is
 * already waiting, in which case the older one wins and the stale walk is
 * simply forgotten: two cards in a row would be noise).
 */
function loadState(): WalkState {
  if (typeof window === "undefined") return { walk: null, summary: null };
  const now = Date.now();
  const pending = read<Walk>(SUMMARY_KEY);
  const stored = read<Walk>(WALK_KEY);
  if (stored && isStale(stored, now)) {
    write(WALK_KEY, null);
    if (!pending && stored.entries.length > 0) {
      write(SUMMARY_KEY, stored);
      return { walk: null, summary: stored };
    }
    return { walk: null, summary: pending };
  }
  return { walk: stored, summary: pending };
}

export function useWalk() {
  const [state, setState] = useState<WalkState>(loadState);
  const { walk, summary } = state;

  /** Record a first-time vote on a target. Re-votes are not walk events. */
  const record = useCallback((entry: WalkEntry) => {
    const now = Date.now();
    setState((prev) => {
      let base = prev.walk;
      if (base && isStale(base, now)) {
        // Went quiet while the app stayed open: close it for the next start-up.
        if (base.entries.length > 0 && !read<Walk>(SUMMARY_KEY)) write(SUMMARY_KEY, base);
        base = null;
      }
      const entries = (base?.entries ?? []).filter((e) => e.id !== entry.id);
      const next: Walk = {
        startedAt: base?.startedAt ?? now,
        lastAt: now,
        entries: [...entries, entry],
      };
      write(WALK_KEY, next);
      return { ...prev, walk: next };
    });
  }, []);

  const dismissSummary = useCallback(() => {
    write(SUMMARY_KEY, null);
    setState((prev) => ({ ...prev, summary: null }));
  }, []);

  return { walk, summary, record, dismissSummary };
}
