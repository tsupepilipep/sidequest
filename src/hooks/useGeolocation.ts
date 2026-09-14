"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
}

interface GeolocationState {
  position: GeoPosition | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
}

function friendlyError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission denied";
    case err.POSITION_UNAVAILABLE:
      return "Location unavailable";
    case err.TIMEOUT:
      return "Location request timed out";
    default:
      return "Unknown location error";
  }
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};

const FRESH_GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 3000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    accuracy: null,
    loading: false,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    setState({
      position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      accuracy: pos.coords.accuracy,
      loading: false,
      error: null,
    });
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      loading: false,
      error: friendlyError(err),
    }));
  }, []);

  /**
   * Request the current position once.
   * With `fresh: true` only a fix from the last few seconds is accepted,
   * so an explicit "relocate" gets a recent reading without forcing the
   * device to wait for a brand-new GPS lock (which can take ~10s).
   */
  const locate = useCallback(
    (options?: { fresh?: boolean }) => {
      if (!navigator.geolocation) {
        setState((prev) => ({
          ...prev,
          error: "Geolocation not supported",
        }));
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: null }));
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        options?.fresh ? FRESH_GEO_OPTIONS : GEO_OPTIONS
      );
    },
    [handleSuccess, handleError]
  );

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      GEO_OPTIONS
    );
  }, [handleSuccess, handleError]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { ...state, locate, startWatching, stopWatching };
}
