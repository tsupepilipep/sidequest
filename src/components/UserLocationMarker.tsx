"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { GeoPosition } from "@/hooks/useGeolocation";

interface Props {
  position: GeoPosition;
  accuracy: number | null;
}

export default function UserLocationMarker({ position, accuracy }: Props) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    const latlng: L.LatLngExpression = [position.lat, position.lng];

    const icon = L.divIcon({
      className: "",
      html: '<div class="user-dot"><div class="user-dot-pulse"></div><div class="user-dot-center"></div></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, {
        icon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(icon);
    }

    if (accuracy) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: accuracy,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3,
          interactive: false,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(accuracy);
      }
    }

    return () => {};
  }, [map, position, accuracy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
      }
      if (circleRef.current) {
        circleRef.current.remove();
      }
    };
  }, []);

  return null;
}
