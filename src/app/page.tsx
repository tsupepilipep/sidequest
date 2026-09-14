"use client";

import dynamic from "next/dynamic";

// Leaflet requires browser APIs (window), so we must disable SSR
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

export default function Home() {
  return <Map />;
}
