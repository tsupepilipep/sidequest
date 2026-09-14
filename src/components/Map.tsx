"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Map as LeafletMap, Layer, PathOptions, LeafletMouseEvent } from "leaflet";
import type { Feature } from "geojson";
import { useSegments } from "@/hooks/useSegments";
import { useIntersections } from "@/hooks/useIntersections";
import { useGeolocation, type GeoPosition } from "@/hooks/useGeolocation";
import { useMyRatings } from "@/hooks/useMyRatings";
import { findNearestIntersection, findNearestSegment } from "@/lib/geo/snap";
import type {
  IntersectionProperties,
  RatedProperties,
  RatingValue,
  SegmentProperties,
  Selected,
  TargetMode,
  ViewMode,
} from "@/lib/types";
import RatingPanel, { optimisticUpdate } from "./RatingPanel";
import Legend from "./Legend";
import LocateButton from "./LocateButton";
import LiveButton from "./LiveButton";
import SegmentedControl from "./SegmentedControl";
import UserLocationMarker from "./UserLocationMarker";

import "leaflet/dist/leaflet.css";

const SOFIA_CENTER: [number, number] = [42.6975, 23.3242];
const DEFAULT_ZOOM = 13;
const AUTO_SNAP_ZOOM = 17;
const SELECTION_COLOR = "#1d4ed8";

// Custom map panes, created once when the map mounts. Leaflet's default
// overlayPane is z-index 400 and markerPane 600; these sit in between so
// intersection dots draw above the segment lines and the selection
// highlight draws above everything else.
const INTERSECTIONS_PANE = "intersections";
const SELECTION_PANE = "selected-target";
const PANES: { name: string; zIndex: number }[] = [
  { name: INTERSECTIONS_PANE, zIndex: 420 },
  { name: SELECTION_PANE, zIndex: 450 },
];

// Intersection dots are hidden when zoomed out; they'd just be noise.
const INTERSECTION_MIN_ZOOM = 16;
// ...but show them a little earlier when intersections are what you're rating.
const INTERSECTION_MIN_ZOOM_ACTIVE = 15;

const VIEW_MODE_KEY = "sidequest_view_mode";
const TARGET_MODE_KEY = "sidequest_target_mode";
const LIVE_MODE_KEY = "sidequest_live_mode";
// Live mode: how often to re-pick the nearest target and re-centre the map.
const LIVE_INTERVAL_MS = 5000;
// Live mode: ignore GPS jitter smaller than this when deciding whether to pan.
const LIVE_MIN_MOVE_M = 3;
// Below this zoom, entering live mode zooms in so the street is legible.
const LIVE_MIN_ZOOM = 16;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable; the choice just won't persist
  }
}

/** Approximate distance in metres between two positions (fine at city scale). */
function distanceM(a: GeoPosition, b: GeoPosition): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function ratingColor(value: number | null): string {
  if (value === null) return "#888888";
  if (value < 0.67) return "#ef4444";
  if (value < 1.34) return "#eab308";
  return "#22c55e";
}

/** Forwards map clicks and zoom changes to the parent. */
function MapEvents({
  onClick,
  onZoom,
}: {
  onClick: (lat: number, lng: number) => void;
  onZoom: (zoom: number) => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
    zoomend() {
      onZoom(map.getZoom());
    },
  });
  return null;
}

/** Captures the Leaflet map instance into a ref and creates the custom panes. */
function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    for (const { name, zIndex } of PANES) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(zIndex);
    }
  }, [map, mapRef]);
  return null;
}

/**
 * Draws the current selection on top of everything else in its own pane, so
 * re-rendering the data layers never covers it. A sidewalk gets a thick blue
 * casing with its own colour inside; an intersection gets a blue ring.
 */
function SelectionHighlight({ selected, innerColor }: { selected: Selected; innerColor: string }) {
  const id = selected.feature.properties.id;

  if (selected.kind === "intersection") {
    const [lng, lat] = selected.feature.geometry.coordinates;
    return (
      <>
        <CircleMarker
          key={`${id}-ring`}
          center={[lat, lng]}
          radius={16}
          pane={SELECTION_PANE}
          interactive={false}
          pathOptions={{ color: SELECTION_COLOR, weight: 4, fill: false, opacity: 0.9 }}
        />
        <CircleMarker
          key={`${id}-inner-${innerColor}`}
          center={[lat, lng]}
          radius={8}
          pane={SELECTION_PANE}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: innerColor, fillOpacity: 1 }}
        />
      </>
    );
  }

  const positions = selected.feature.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as [number, number]
  );
  return (
    <>
      <Polyline
        key={`${id}-casing`}
        positions={positions}
        pane={SELECTION_PANE}
        interactive={false}
        pathOptions={{ color: SELECTION_COLOR, weight: 14, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
      />
      <Polyline
        key={`${id}-inner-${innerColor}`}
        positions={positions}
        pane={SELECTION_PANE}
        interactive={false}
        pathOptions={{ color: innerColor, weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }}
      />
    </>
  );
}

export default function Map() {
  const { data: geojson, setData, loading, error } = useSegments();
  const {
    data: intersectionsGeo,
    setData: setIntersectionsGeo,
    error: intersectionsError,
  } = useIntersections();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  // Everyone / Mine colouring. Remembered per browser.
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    readStored(VIEW_MODE_KEY) === "personal" ? "personal" : "global"
  );
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    writeStored(VIEW_MODE_KEY, mode);
  }, []);

  // Sidewalk / Intersection: what gets picked and rated. Remembered per browser.
  const [targetMode, setTargetModeState] = useState<TargetMode>(() =>
    readStored(TARGET_MODE_KEY) === "intersection" ? "intersection" : "sidewalk"
  );

  // Live mode: follow the user and auto-select the nearest target. Remembered.
  const [liveMode, setLiveModeState] = useState<boolean>(() => readStored(LIVE_MODE_KEY) === "on");
  const toggleLiveMode = useCallback(() => {
    const next = !liveMode;
    writeStored(LIVE_MODE_KEY, next ? "on" : "off");
    setLiveModeState(next);
  }, [liveMode]);

  const geo = useGeolocation();
  const myRatings = useMyRatings();
  const mapRef = useRef<LeafletMap | null>(null);
  const hasAutoSnapped = useRef(false);
  const userHasSelected = useRef(false);
  // Set when the user presses "relocate"; consumed by the next position fix.
  const pendingRelocate = useRef(false);

  const segments = useMemo(() => geojson?.features ?? [], [geojson]);
  const intersections = useMemo(() => intersectionsGeo?.features ?? [], [intersectionsGeo]);

  // Latest position readable from the live-mode interval and event handlers
  // without restarting them every time it changes.
  const positionRef = useRef<GeoPosition | null>(null);
  positionRef.current = geo.position;

  /** Nearest target of the given kind to a point, or null if nothing is close. */
  const pickNearestOfKind = useCallback(
    (mode: TargetMode, lat: number, lng: number): Selected | null => {
      if (mode === "intersection") {
        const f = findNearestIntersection(lat, lng, intersections);
        return f ? { kind: "intersection", feature: f } : null;
      }
      const f = findNearestSegment(lat, lng, segments);
      return f ? { kind: "segment", feature: f } : null;
    },
    [segments, intersections]
  );
  const pickNearest = useCallback(
    (lat: number, lng: number) => pickNearestOfKind(targetMode, lat, lng),
    [pickNearestOfKind, targetMode]
  );
  const pickNearestRef = useRef(pickNearest);
  pickNearestRef.current = pickNearest;

  const setTargetMode = useCallback(
    (mode: TargetMode) => {
      setTargetModeState(mode);
      writeStored(TARGET_MODE_KEY, mode);
      // Switching kind means "show me the nearest <kind>" right away: near the
      // user if we know where they are, otherwise near the middle of the view.
      const centre = mapRef.current?.getCenter();
      const origin = positionRef.current ?? (centre ? { lat: centre.lat, lng: centre.lng } : null);
      if (!origin) return;
      setSelected(pickNearestOfKind(mode, origin.lat, origin.lng));
      userHasSelected.current = false;
    },
    [pickNearestOfKind]
  );

  // Colour for any rated thing under the current view mode.
  const { ratings: myRatingMap } = myRatings;
  const colorFor = useCallback(
    (props: RatedProperties): string =>
      viewMode === "global"
        ? ratingColor(props.median_rating)
        : ratingColor(myRatingMap[props.id] ?? null),
    [viewMode, myRatingMap]
  );

  const segmentStyle = useCallback(
    (feature?: Feature): PathOptions => ({
      color: colorFor(feature?.properties as SegmentProperties),
      weight: 4,
      opacity: 0.8,
    }),
    [colorFor]
  );

  // Intersections are drawn as dots: bold and tappable when they're the
  // active kind, small and inert otherwise.
  const intersectionActive = targetMode === "intersection";
  const intersectionPointToLayer = useCallback(
    (feature: Feature, latlng: L.LatLng): Layer =>
      L.circleMarker(latlng, {
        pane: INTERSECTIONS_PANE,
        radius: intersectionActive ? 7 : 4,
        color: "#ffffff",
        weight: intersectionActive ? 2 : 1,
        fillColor: colorFor(feature.properties as IntersectionProperties),
        fillOpacity: intersectionActive ? 0.95 : 0.7,
        interactive: intersectionActive,
      }),
    [intersectionActive, colorFor]
  );

  // Any tap on the map (or on a drawn feature) picks the nearest active-kind target.
  const handleMapClick = useCallback((lat: number, lng: number) => {
    const picked = pickNearestRef.current(lat, lng);
    if (picked) userHasSelected.current = true;
    setSelected(picked);
  }, []);

  const onEachFeature = useCallback(
    (_feature: Feature, layer: Layer) => {
      layer.on("click", (e: LeafletMouseEvent) => {
        handleMapClick(e.latlng.lat, e.latlng.lng);
      });
    },
    [handleMapClick]
  );

  // Request GPS on mount once segments are loaded
  useEffect(() => {
    if (!loading && segments.length > 0) {
      geo.locate();
      geo.startWatching();
    }
    // Only run when loading transitions to done with segments
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, segments.length > 0]);

  /**
   * Fly to a position and select the nearest target.
   * `replaceSelection` also clears an existing manual pick (used by relocate).
   */
  const snapTo = useCallback((position: GeoPosition, replaceSelection: boolean) => {
    mapRef.current?.flyTo([position.lat, position.lng], AUTO_SNAP_ZOOM, {
      duration: 1.2,
    });
    const picked = pickNearestRef.current(position.lat, position.lng);
    if (picked || replaceSelection) {
      setSelected(picked);
      if (replaceSelection) userHasSelected.current = false;
    }
  }, []);

  // Snap when either:
  //  - the first position arrives and nothing was picked manually, or
  //  - a relocate was requested and a new fix has come in.
  useEffect(() => {
    if (!geo.position || segments.length === 0) return;

    const isFirstFix = !hasAutoSnapped.current && !userHasSelected.current;
    const isRelocate = pendingRelocate.current;
    if (!isFirstFix && !isRelocate) return;

    hasAutoSnapped.current = true;
    pendingRelocate.current = false;
    snapTo(geo.position, isRelocate);
  }, [geo.position, segments, snapTo]);

  // If the fix fails, forget the pending relocate so a later watch update
  // doesn't unexpectedly move the selection.
  useEffect(() => {
    if (geo.error) pendingRelocate.current = false;
  }, [geo.error]);

  // Relocate: respond instantly with the last position from the background
  // watcher, then refine once a fresh fix arrives (handled by the effect above).
  const { locate, position } = geo;
  const handleLocate = useCallback(() => {
    if (position) snapTo(position, true);
    pendingRelocate.current = true;
    locate({ fresh: true });
  }, [locate, position, snapTo]);

  // Live mode: every few seconds pick the target nearest to where the user is
  // now and keep the map centred on them. No taps needed while walking.
  useEffect(() => {
    if (!liveMode) return;

    let first = true;
    let lastPan: GeoPosition | null = null;

    const tick = () => {
      const pos = positionRef.current;
      const map = mapRef.current;
      if (!pos) return;

      const picked = pickNearestRef.current(pos.lat, pos.lng);
      setSelected((prev) =>
        prev?.kind === picked?.kind && prev?.feature.properties.id === picked?.feature.properties.id
          ? prev
          : picked
      );
      // Live selection is automatic, so it never counts as a manual pick.
      userHasSelected.current = false;
      hasAutoSnapped.current = true;

      if (!map) return;
      const latlng: [number, number] = [pos.lat, pos.lng];
      if (first) {
        first = false;
        lastPan = pos;
        if (map.getZoom() < LIVE_MIN_ZOOM) {
          map.flyTo(latlng, AUTO_SNAP_ZOOM, { duration: 1.2 });
        } else {
          map.panTo(latlng, { animate: true, duration: 0.5 });
        }
      } else if (!lastPan || distanceM(lastPan, pos) > LIVE_MIN_MOVE_M) {
        lastPan = pos;
        map.panTo(latlng, { animate: true, duration: 0.5 });
      }
    };

    // Make sure a fix is on its way if we don't have one yet, then start.
    if (!positionRef.current) locate();
    tick();
    const id = setInterval(tick, LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [liveMode, locate]);

  const { set: setMyRating } = myRatings;
  const handleRated = useCallback(
    (
      targetId: string,
      kind: Selected["kind"],
      newRating: RatingValue,
      previousRating: RatingValue | null
    ) => {
      setMyRating(targetId, newRating);
      if (kind === "segment") {
        if (!geojson) return;
        const updated = optimisticUpdate(geojson, targetId, newRating, previousRating);
        setData(updated);
        const f = updated.features.find((x) => x.properties.id === targetId);
        if (f) setSelected({ kind: "segment", feature: f });
      } else {
        if (!intersectionsGeo) return;
        const updated = optimisticUpdate(intersectionsGeo, targetId, newRating, previousRating);
        setIntersectionsGeo(updated);
        const f = updated.features.find((x) => x.properties.id === targetId);
        if (f) setSelected({ kind: "intersection", feature: f });
      }
    },
    [geojson, setData, intersectionsGeo, setIntersectionsGeo, setMyRating]
  );

  // The GeoJSON layers only restyle when remounted, so key them on everything
  // that changes their appearance: the data, the view mode, the target mode,
  // and (in personal view) this browser's own ratings.
  const ratingsKey = viewMode === "personal" ? myRatings.version : 0;
  const segmentsKey = useMemo(
    () => (geojson ? `${geojson.features.length}-${viewMode}-${ratingsKey}-${Date.now()}` : "empty"),
    [geojson, viewMode, ratingsKey]
  );
  const intersectionsKey = useMemo(
    () =>
      intersectionsGeo
        ? `${intersectionsGeo.features.length}-${viewMode}-${targetMode}-${ratingsKey}-${Date.now()}`
        : "empty",
    [intersectionsGeo, viewMode, targetMode, ratingsKey]
  );
  const showIntersections =
    zoom >= (intersectionActive ? INTERSECTION_MIN_ZOOM_ACTIVE : INTERSECTION_MIN_ZOOM);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-red-600">Failed to load segments: {error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
            <p className="text-gray-600">Loading segments...</p>
          </div>
        </div>
      )}

      <MapContainer
        center={SOFIA_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapRefSetter mapRef={mapRef} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geojson && (
          <GeoJSON
            key={segmentsKey}
            data={geojson}
            style={segmentStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {intersectionsGeo && showIntersections && (
          <GeoJSON
            key={intersectionsKey}
            data={intersectionsGeo}
            pane={INTERSECTIONS_PANE}
            pointToLayer={intersectionPointToLayer}
            onEachFeature={onEachFeature}
          />
        )}

        {selected && (
          <SelectionHighlight selected={selected} innerColor={colorFor(selected.feature.properties)} />
        )}

        <MapEvents onClick={handleMapClick} onZoom={setZoom} />

        {geo.position && (
          <UserLocationMarker
            position={geo.position}
            accuracy={geo.accuracy}
          />
        )}
      </MapContainer>

      <div className="absolute left-4 top-4 z-[1000] flex flex-col items-start gap-2">
        <SegmentedControl<ViewMode>
          label="Map colouring"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "global", label: "Everyone" },
            { value: "personal", label: "Mine" },
          ]}
        />
        <SegmentedControl<TargetMode>
          label="What to rate"
          value={targetMode}
          onChange={setTargetMode}
          options={[
            { value: "sidewalk", label: "Sidewalk" },
            { value: "intersection", label: "Intersection" },
          ]}
        />
      </div>

      <Legend mode={viewMode} offsetBottom={!!selected} />

      <LocateButton
        loading={geo.loading}
        active={!!geo.position}
        error={geo.error}
        onClick={handleLocate}
      />

      <LiveButton active={liveMode} error={geo.error} onToggle={toggleLiveMode} />

      {intersectionActive && intersectionsError && (
        <div className="absolute left-4 right-4 top-32 z-[1000] rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 shadow sm:left-auto sm:w-80">
          Intersections unavailable: {intersectionsError}
        </div>
      )}

      {selected && (
        <RatingPanel
          selected={selected}
          myRating={myRatings.get(selected.feature.properties.id)}
          onClose={() => {
            setSelected(null);
            userHasSelected.current = false;
          }}
          onRated={handleRated}
        />
      )}
    </div>
  );
}
