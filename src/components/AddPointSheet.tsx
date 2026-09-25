"use client";

import { useState } from "react";
import { ACCESS_COLOR, GLYPH, UNDERPASS_COLOR } from "./PoiMarkers";
import type { AddableKind } from "@/lib/types";

const KINDS: { kind: AddableKind; label: string; color: string; glyph: string; hint: string }[] = [
  { kind: "elevator", label: "Elevator", color: ACCESS_COLOR.elevator, glyph: GLYPH.elevator, hint: "the lift door" },
  { kind: "ramp", label: "Ramp", color: ACCESS_COLOR.ramp, glyph: GLYPH.ramp, hint: "where the ramp starts" },
  { kind: "underpass", label: "Underpass", color: UNDERPASS_COLOR.unknown, glyph: GLYPH.underpass, hint: "the middle of the underpass" },
];

interface Props {
  /** Preselected kind (from "Mark the ramp"), or null to let the user choose. */
  initialKind: AddableKind | null;
  onPlace: (kind: AddableKind) => Promise<void>;
  onCancel: () => void;
}

/**
 * Placing flow shared by elevators, ramps and underpasses: a crosshair sits
 * at the map centre, the user pans until it's on the spot, picks what it
 * is and taps Place. In live mode the map already follows you, so the
 * crosshair is usually right where you're standing.
 */
export default function AddPointSheet({ initialKind, onPlace, onCancel }: Props) {
  const [kind, setKind] = useState<AddableKind | null>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = KINDS.find((k) => k.kind === kind) ?? null;

  const place = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await onPlace(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <>
      {/* Crosshair at the map centre; the map stays pannable underneath. */}
      <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center" aria-hidden>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white shadow-lg"
          style={{ backgroundColor: chosen?.color ?? "#1d4ed8", opacity: 0.9 }}
          dangerouslySetInnerHTML={{ __html: chosen?.glyph ?? "" }}
        />
        <div className="absolute h-3 w-3 rounded-full bg-white ring-2 ring-gray-900" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2 sm:rounded-2xl sm:pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Add to the map</p>
        <h2 className="text-lg font-semibold text-gray-900">
          {chosen ? `Move the map so the marker is on ${chosen.hint}` : "What are you standing at?"}
        </h2>

        <div className="mt-3 flex gap-2">
          {KINDS.map((k) => {
            const active = k.kind === kind;
            return (
              <button
                key={k.kind}
                onClick={() => setKind(k.kind)}
                aria-pressed={active}
                disabled={busy}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                  active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span
                  className="flex h-7 w-7 rounded-md"
                  style={{ backgroundColor: k.color }}
                  dangerouslySetInnerHTML={{ __html: k.glyph }}
                />
                {k.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={place}
            disabled={busy || !kind}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Placing…" : chosen ? `Place ${chosen.label.toLowerCase()}` : "Place"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
      </div>
    </>
  );
}
