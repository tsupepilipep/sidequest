"use client";

import { useState } from "react";
import {
  ACCESS_COLOR,
  ACCESS_LABEL,
  UNDERPASS_COLOR,
  UNDERPASS_LABEL,
  underpassState,
} from "./PoiMarkers";
import type { SelectedPoi, UnderpassFeature } from "@/lib/types";

const SHEET =
  "absolute bottom-0 left-0 right-0 z-[1000] rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2 sm:rounded-2xl sm:pb-4";

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      aria-label="Close"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />;
}

interface Props {
  selected: SelectedPoi;
  /** This browser added the selected point, so it may remove it. */
  mine: boolean;
  onClose: () => void;
  onRemove: () => Promise<void>;
  /** Underpass only: vote true/false, or null to withdraw. */
  onVote: (hasRamp: boolean | null) => Promise<UnderpassFeature | null>;
  /** Underpass only: start placing a ramp next to it. */
  onAddRamp: () => void;
}

/** Bottom sheet for an elevator, ramp or underpass. */
export default function PoiPanel({ selected, mine, onClose, onRemove, onVote, onAddRamp }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const source = selected.feature.properties.source;
  const attribution = source === "osm" ? "According to OpenStreetMap" : mine ? "Added by you" : "Added by a walker";

  if (selected.kind === "access") {
    const { kind, label, level } = selected.feature.properties;
    return (
      <div className={SHEET}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              <Swatch color={ACCESS_COLOR[kind]} /> {ACCESS_LABEL[kind]}
            </p>
            <h2 className="text-lg font-semibold text-gray-900">{label ?? (kind === "elevator" ? "Metro elevator" : "Ramp")}</h2>
            {level && <p className="mt-1 text-sm text-gray-600">Levels: {level.replaceAll(";", " · ")}</p>}
            <p className="mt-1 text-xs text-gray-400">{attribution}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {mine && (
          <button
            onClick={() => run(onRemove)}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Remove this {ACCESS_LABEL[kind].toLowerCase()}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
      </div>
    );
  }

  const f = selected.feature;
  const { name, has_ramp_nearby, no_ramp_votes, ramp_votes, my_vote } = f.properties;
  const state = underpassState(f);
  return (
    <div className={SHEET}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Underpass</p>
          <h2 className="text-lg font-semibold text-gray-900">{name ?? "Unnamed underpass"}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
            <Swatch color={UNDERPASS_COLOR[state]} />
            {UNDERPASS_LABEL[state]}
            {has_ramp_nearby && <span className="text-xs text-gray-400">(ramp marked nearby)</span>}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {attribution}
            {no_ramp_votes + ramp_votes > 0 && ` · ${no_ramp_votes} said no ramps, ${ramp_votes} said there is one`}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <p className="mt-3 text-sm text-gray-600">Is there a ramp?</p>
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => run(() => onVote(my_vote === false ? null : false))}
          disabled={busy}
          aria-pressed={my_vote === false}
          className={`flex-1 rounded-xl px-3 py-3 text-sm font-medium transition-colors disabled:opacity-50 ${
            my_vote === false ? "bg-red-500 text-white ring-2 ring-gray-900 ring-offset-2" : "bg-red-100 text-red-800 hover:bg-red-200"
          }`}
        >
          {my_vote === false ? "✓ No ramps" : "No ramps"}
        </button>
        <button
          onClick={onAddRamp}
          disabled={busy}
          className="flex-1 rounded-xl bg-teal-600 px-3 py-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          + Mark the ramp
        </button>
      </div>
      {/* Always rendered so the sheet doesn't reflow under a finger after a vote. */}
      {!has_ramp_nearby && (
        <button
          onClick={() => run(() => onVote(my_vote === true ? null : true))}
          disabled={busy}
          aria-pressed={my_vote === true}
          className="mt-2 w-full rounded-xl py-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
        >
          {my_vote === true ? "✓ You said there is a ramp (tap to undo)" : "There is a ramp, but I can't mark where"}
        </button>
      )}
      {mine && (
        <button
          onClick={() => run(onRemove)}
          disabled={busy}
          className="mt-2 w-full rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Remove this underpass
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
    </div>
  );
}
