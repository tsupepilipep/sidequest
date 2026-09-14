import type { Feature, FeatureCollection, LineString } from "geojson";

export interface SegmentProperties {
  id: string;
  osm_way_id: number;
  name: string | null;
  highway_type: string;
  median_rating: number | null;
  rating_count: number;
}

export type SegmentFeature = Feature<LineString, SegmentProperties>;
export type SegmentsGeoJSON = FeatureCollection<LineString, SegmentProperties>;

export interface Rating {
  id: string;
  segment_id: string;
  browser_id: string;
  rating: 0 | 1 | 2;
  side: "left" | "right" | null;
  created_at: string;
}

export interface RatingInput {
  segment_id: string;
  browser_id: string;
  rating: 0 | 1 | 2;
  side?: "left" | "right" | null;
}

export interface SegmentRow {
  id: string;
  osm_way_id: number;
  name: string | null;
  highway_type: string;
  geojson: LineString;
  median_rating: number | null;
  rating_count: number;
}
