"use client";

import type { ViewMode } from "@/lib/types";
import { ACCESS_COLOR, CLOSED_SLASH_STYLE, GLYPH, UNDERPASS_COLOR } from "./PoiMarkers";

const POIS = [
  { color: ACCESS_COLOR.elevator, label: "Metro elevator", glyph: GLYPH.elevator, round: false },
  { color: ACCESS_COLOR.ramp, label: "Ramp", glyph: GLYPH.ramp, round: false },
  { color: ACCESS_COLOR.elevator, label: "Permanently closed", glyph: GLYPH.elevator, round: false, closed: true },
  { color: UNDERPASS_COLOR.ramp, label: "Underpass with ramp", glyph: GLYPH.underpass, round: true },
  { color: UNDERPASS_COLOR.no_ramp, label: "Underpass, no ramps", glyph: GLYPH.underpass, round: true },
  { color: UNDERPASS_COLOR.unknown, label: "Underpass, unknown", glyph: GLYPH.underpass, round: true },
];

const ITEMS = [
  { color: "#22c55e", label: "Good (1.34–2)" },
  { color: "#eab308", label: "Passable (0.67–1.33)" },
  { color: "#ef4444", label: "Terrible (0–0.66)" },
];

interface Props {
  mode: ViewMode;
  offsetBottom?: boolean;
}

export default function Legend({ mode, offsetBottom = false }: Props) {
  const items = [
    ...ITEMS,
    { color: "#888888", label: mode === "personal" ? "Not rated by you" : "Not rated" },
  ];
  return (
    <div className={`absolute left-4 z-[1000] hidden sm:block rounded-lg bg-white/90 px-3 py-2 text-sm shadow-md backdrop-blur-sm ${offsetBottom ? "bottom-48" : "bottom-4"}`}>
      <div className="mb-1 font-semibold text-gray-700">
        {mode === "personal" ? "Your ratings" : "Sidewalk Quality"}
      </div>
      {items.map(({ color, label }) => (
        <div key={color} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-3 w-6 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-600">{label}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-gray-200 pt-1">
        {POIS.map(({ color, label, glyph, round, closed }) => (
          <div key={label} className="flex items-center gap-2 py-0.5">
            <span
              className={`relative inline-flex h-4 w-4 shrink-0 overflow-hidden ${round ? "rounded-full" : "rounded-[4px]"}`}
              style={{ backgroundColor: color }}
            >
              <span className="absolute inset-0" dangerouslySetInnerHTML={{ __html: glyph }} />
              {closed && <span className="absolute inset-0" style={{ background: CLOSED_SLASH_STYLE }} />}
            </span>
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
