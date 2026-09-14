"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap, Layer, PathOptions, LeafletMouseEvent } from "leaflet";
import type { Feature } from "geojson";
import { useSegments } from "@/hooks/useSegments";
import { useGeolocation } from "@/hooks/useGeolocation";
import { findNearestSegment } from "@/lib/geo/snap";
import type { SegmentFeature, SegmentProperties } from "@/lib/types";
import RatingPanel, { optimisticUpdate } from "./RatingPanel";
import Legend from "./Legend";
import LocateButton from "./LocateButton";
import UserLocationMarker from "./UserLocationMarker";

import "leaflet/dist/leaflet.css";

const SOFIA_CENTER: [number, number] = [42.6975, 23.3242];
const DEFAULT_ZOOM = 13;
const AUTO_SNAP_ZOOM = 17;

function ratingColor(median: number | null): string {
  if (median === null) return "#888888";
  if (median < 0.67) return "#ef4444";
  if (median < 1.34) return "#eab308";
  return "#22c55e";
}

function segmentStyle(feature?: Feature): PathOptions {
  const props = feature?.properties as SegmentProperties | undefined;
  return {
    color: ratingColor(props?.median_rating ?? null),
    weight: 4,
    opacity: 0.8,
  };
}

function MapClickHandler({
  segments,
  onSelect,
}: {
  segments: SegmentFeature[];
  onSelect: (segment: SegmentFeature | null) => void;
}) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      const nearest = findNearestSegment(e.latlng.lat, e.latlng.lng, segments);
      onSelect(nearest);
    },
  });
  return null;
}

/** Captures the Leaflet map instance into a ref */
function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

export default function Map() {
  const { data: geojson, setData, loading, error } = useSegments();
  const [selected, setSelected] = useState<SegmentFeature | null>(null);
  const geo = useGeolocation();
  const mapRef = useRef<LeafletMap | null>(null);
  const hasAutoSnapped = useRef(false);
  const userHasSelected = useRef(false);

  const segments = useMemo(() => geojson?.features ?? [], [geojson]);

  // Track manual selections so we don't override them with auto-snap
  const handleSelect = useCallback((segment: SegmentFeature | null) => {
    if (segment) userHasSelected.current = true;
    setSelected(segment);
  }, []);

  // Request GPS on mount once segments are loaded
  useEffect(() => {
    if (!loading && segments.length > 0) {
      geo.locate();
      geo.startWatching();
    }
    // Only run when loading transitions to done with segments
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, segments.length > 0]);

  // Auto-snap when first position arrives
  useEffect(() => {
    if (
      geo.position &&
      !hasAutoSnapped.current &&
      !userHasSelected.current &&
      segments.length > 0
    ) {
      hasAutoSnapped.current = true;

      if (mapRef.current) {
        mapRef.current.flyTo([geo.position.lat, geo.position.lng], AUTO_SNAP_ZOOM, {
          duration: 1.2,
        });
      }

      const nearest = findNearestSegment(
        geo.position.lat,
        geo.position.lng,
        segments
      );
      if (nearest) {
        setSelected(nearest);
      }
    }
  }, [geo.position, segments]);

  // Locate button handler: re-pan + re-snap
  const handleLocate = useCallback(() => {
    geo.locate();

    if (geo.position && mapRef.current) {
      mapRef.current.flyTo([geo.position.lat, geo.position.lng], AUTO_SNAP_ZOOM, {
        duration: 1.2,
      });

      const nearest = findNearestSegment(
        geo.position.lat,
        geo.position.lng,
        segments
      );
      if (nearest) {
        setSelected(nearest);
        userHasSelected.current = true;
      }
    }
  }, [geo, segments]);

  const handleRated = useCallback(
    (segmentId: string, newRating: number) => {
      if (!geojson) return;
      const updated = optimisticUpdate(geojson, segmentId, newRating);
      setData(updated);
      const updatedSegment = updated.features.find(
        (f) => f.properties.id === segmentId
      );
      if (updatedSegment) setSelected(updatedSegment);
    },
    [geojson, setData]
  );

  const onEachFeature = useCallback(
    (_feature: Feature, layer: Layer) => {
      layer.on("click", () => {
        const f = _feature as SegmentFeature;
        handleSelect(f);
      });
    },
    [handleSelect]
  );

  const geojsonKey = useMemo(
    () => (geojson ? JSON.stringify(geojson.features.length) + Date.now() : "empty"),
    [geojson]
  );

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
            key={geojsonKey}
            data={geojson}
            style={segmentStyle}
            onEachFeature={onEachFeature}
          />
        )}

        <MapClickHandler segments={segments} onSelect={handleSelect} />

        {geo.position && (
          <UserLocationMarker
            position={geo.position}
            accuracy={geo.accuracy}
          />
        )}
      </MapContainer>

      <Legend offsetBottom={!!selected} />

      <LocateButton
        loading={geo.loading}
        active={!!geo.position}
        error={geo.error}
        onClick={handleLocate}
      />

      {selected && (
        <RatingPanel
          segment={selected}
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
