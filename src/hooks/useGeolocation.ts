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
  // Whether the caller wants a watch running. The actual watch is torn down
  // while the page is hidden (GPS is the biggest battery cost of the app) and
  // re-created when it becomes visible again.
  const wantWatchRef = useRef(false);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;
    setState((prev) => {
      // watchPosition can fire repeatedly with an unchanged fix; skip the
      // re-render in that case so the map does no work for it.
      if (
        !prev.loading &&
        !prev.error &&
        prev.position?.lat === latitude &&
        prev.position?.lng === longitude &&
        prev.accuracy === accuracy
      ) {
        return prev;
      }
      return {
        position: { lat: latitude, lng: longitude },
        accuracy,
        loading: false,
        error: null,
      };
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

  const beginWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      GEO_OPTIONS
    );
  }, [handleSuccess, handleError]);

  const endWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    wantWatchRef.current = true;
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      beginWatch();
    }
  }, [beginWatch]);

  const stopWatching = useCallback(() => {
    wantWatchRef.current = false;
    endWatch();
  }, [endWatch]);

  // Pause the GPS watch while the page is in the background and resume it
  // when the user comes back. Their first fix on return is a fresh one.
  useEffect(() => {
    const onVisibility = () => {
      if (!wantWatchRef.current) return;
      if (document.visibilityState === "hidden") endWatch();
      else beginWatch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [beginWatch, endWatch]);

  useEffect(() => endWatch, [endWatch]);

  return { ...state, locate, startWatching, stopWatching };
}
