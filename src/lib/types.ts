import type { Feature, FeatureCollection, LineString, Point } from "geojson";

export type RatingValue = 0 | 1 | 2;

/** How the map is coloured: everyone's median, or only this browser's votes. */
export type ViewMode = "global" | "personal";

/** What gets picked and rated: the nearest sidewalk or the nearest intersection. */
export type TargetMode = "sidewalk" | "intersection";

/** Shared by segments and intersections: what the rating UI needs. */
export interface RatedProperties {
  id: string;
  median_rating: number | null;
  rating_count: number;
}

export interface SegmentProperties extends RatedProperties {
  osm_way_id: number;
  name: string | null;
  highway_type: string;
}

export type SegmentFeature = Feature<LineString, SegmentProperties>;
export type SegmentsGeoJSON = FeatureCollection<LineString, SegmentProperties>;

export interface IntersectionProperties extends RatedProperties {
  street_names: string[];
  degree: number;
}

export type IntersectionFeature = Feature<Point, IntersectionProperties>;
export type IntersectionsGeoJSON = FeatureCollection<Point, IntersectionProperties>;

/** The thing currently selected on the map. */
export type Selected =
  | { kind: "segment"; feature: SegmentFeature }
  | { kind: "intersection"; feature: IntersectionFeature };

export interface Rating {
  id: string;
  segment_id: string;
  browser_id: string;
  rating: RatingValue;
  side: "left" | "right" | null;
  created_at: string;
}

/** POST /api/ratings body: exactly one of segment_id / intersection_id. */
export interface RatingInput {
  segment_id?: string;
  intersection_id?: string;
  browser_id: string;
  rating: RatingValue;
  side?: "left" | "right" | null;
}

/** One of this browser's own votes, as returned by GET /api/ratings?browser_id= */
export interface MyRatingRow {
  id: string;
  kind: "segment" | "intersection";
  rating: RatingValue;
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

export interface IntersectionRow {
  id: string;
  geojson: Point;
  street_names: string[];
  degree: number;
  median_rating: number | null;
  rating_count: number;
}
