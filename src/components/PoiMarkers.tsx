"use client";

import { useMemo } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import type { AccessPointFeature, AccessKind, UnderpassFeature } from "@/lib/types";

export const POI_PANE = "pois";

/** Elevators and ramps are facts, so they get their own hues, not the rating traffic light. */
export const ACCESS_COLOR: Record<AccessKind, string> = {
  elevator: "#4f46e5",
  ramp: "#0d9488",
};
export const ACCESS_LABEL: Record<AccessKind, string> = {
  elevator: "Elevator",
  ramp: "Ramp",
};
/** A point reported permanently closed keeps its colour and gets a red slash. */
export const CLOSED_SLASH = "#ef4444";
export const CLOSED_SLASH_STYLE = `linear-gradient(45deg, transparent 42%, ${CLOSED_SLASH} 42%, ${CLOSED_SLASH} 58%, transparent 58%)`;
export const isClosed = (f: AccessPointFeature) => f.properties.closed_votes > 0;

/** An underpass is a question ("can I get through without stairs?"), so it uses the verdict colours. */
export type UnderpassState = "ramp" | "no_ramp" | "unknown";
export const UNDERPASS_COLOR: Record<UnderpassState, string> = {
  ramp: "#22c55e",
  no_ramp: "#ef4444",
  unknown: "#6b7280",
};
export const UNDERPASS_LABEL: Record<UnderpassState, string> = {
  ramp: "Has a ramp",
  no_ramp: "No ramps",
  unknown: "Ramp unknown",
};

export function underpassState(f: UnderpassFeature): UnderpassState {
  const p = f.properties;
  if (p.has_ramp_nearby || p.ramp_votes > p.no_ramp_votes) return "ramp";
  if (p.no_ramp_votes > 0) return "no_ramp";
  return "unknown";
}

const SVG_ATTRS = `viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="70%" height="70%" style="display:block;margin:auto"`;
export const GLYPH = {
  elevator: `<svg ${SVG_ATTRS}><path d="M8 4v16M8 4l-3 3M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3"/></svg>`,
  ramp: `<svg ${SVG_ATTRS}><path d="M3 18h18M3 18L21 7M21 7v11"/></svg>`,
  underpass: `<svg ${SVG_ATTRS}><path d="M4 20v-8a8 8 0 0116 0v8M4 20h4v-6M20 20h-4v-6"/></svg>`,
};

// The visible box is smaller than the icon: the transparent margin is a
// finger-sized tap target, which matters next to a busy street. Not so
// big that neighbouring markers (a lift beside an underpass) steal taps.
const HIT_SIZE = 36;

export function makePoiIcon(
  color: string,
  glyph: string,
  selected: boolean,
  round = false,
  closed = false
): L.DivIcon {
  const size = selected ? 30 : 24;
  const slash = closed
    ? `<div style="position:absolute;inset:-2px;border-radius:inherit;background:${CLOSED_SLASH_STYLE}"></div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [HIT_SIZE, HIT_SIZE],
    iconAnchor: [HIT_SIZE / 2, HIT_SIZE / 2],
    html: `<div style="width:${HIT_SIZE}px;height:${HIT_SIZE}px;display:flex;align-items:center;justify-content:center"><div style="position:relative;width:${size}px;height:${size}px;border-radius:${round ? "50%" : "7px"};background:${color};display:flex;border:2px solid ${selected ? "#1d4ed8" : "#fff"};box-shadow:0 1px 3px rgba(0,0,0,.4);${closed ? "opacity:.85" : ""}">${glyph}${slash}</div></div>`,
  });
}

export function accessTitle(f: AccessPointFeature): string {
  const { kind, label, source } = f.properties;
  const base = label
    ? `${ACCESS_LABEL[kind]} at ${label}`
    : source === "user"
      ? `${ACCESS_LABEL[kind]} (added by a walker)`
      : ACCESS_LABEL[kind];
  return isClosed(f) ? `${base} (permanently closed)` : base;
}

export function underpassTitle(f: UnderpassFeature): string {
  return f.properties.name ? `Underpass at ${f.properties.name}` : "Underpass";
}

interface Props {
  access: AccessPointFeature[];
  underpasses: UnderpassFeature[];
  selectedId: string | null;
  onSelectAccess: (feature: AccessPointFeature) => void;
  onSelectUnderpass: (feature: UnderpassFeature) => void;
}

/** Markers for elevators, ramps and underpasses. */
export default function PoiMarkers({ access, underpasses, selectedId, onSelectAccess, onSelectUnderpass }: Props) {
  const icons = useMemo(() => {
    const pair = (color: string, glyph: string, round = false, closed = false) => ({
      normal: makePoiIcon(color, glyph, false, round, closed),
      selected: makePoiIcon(color, glyph, true, round, closed),
    });
    return {
      elevator: pair(ACCESS_COLOR.elevator, GLYPH.elevator),
      ramp: pair(ACCESS_COLOR.ramp, GLYPH.ramp),
      elevator_closed: pair(ACCESS_COLOR.elevator, GLYPH.elevator, false, true),
      ramp_closed: pair(ACCESS_COLOR.ramp, GLYPH.ramp, false, true),
      ramp_up: pair(UNDERPASS_COLOR.ramp, GLYPH.underpass, true),
      no_ramp: pair(UNDERPASS_COLOR.no_ramp, GLYPH.underpass, true),
      unknown: pair(UNDERPASS_COLOR.unknown, GLYPH.underpass, true),
    };
  }, []);

  const marker = (
    id: string,
    coords: [number, number],
    icon: { normal: L.DivIcon; selected: L.DivIcon },
    title: string,
    onClick: () => void
  ) => {
    const selected = id === selectedId;
    return (
      <Marker
        key={id}
        position={[coords[1], coords[0]]}
        pane={POI_PANE}
        icon={selected ? icon.selected : icon.normal}
        zIndexOffset={selected ? 1000 : 0}
        title={title}
        alt={title}
        // Don't let the tap fall through to the map and pick a sidewalk too.
        bubblingMouseEvents={false}
        eventHandlers={{
          click: (e) => {
            L.DomEvent.stopPropagation(e.originalEvent);
            onClick();
          },
        }}
      />
    );
  };

  return (
    <>
      {underpasses.map((f) => {
        const state = underpassState(f);
        const icon = state === "ramp" ? icons.ramp_up : state === "no_ramp" ? icons.no_ramp : icons.unknown;
        return marker(f.properties.id, f.geometry.coordinates as [number, number], icon, `${underpassTitle(f)}: ${UNDERPASS_LABEL[state]}`, () => onSelectUnderpass(f));
      })}
      {access.map((f) =>
        marker(
          f.properties.id,
          f.geometry.coordinates as [number, number],
          isClosed(f) ? icons[`${f.properties.kind}_closed`] : icons[f.properties.kind],
          accessTitle(f),
          () => onSelectAccess(f)
        )
      )}
    </>
  );
}
