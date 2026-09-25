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

/** Leaderboard window: votes first cast in the last 7 days, or ever. */
export type LeaderboardPeriod = "week" | "all";

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  /** Targets rated (sidewalks + intersections). */
  votes: number;
  /** Metres of sidewalk rated. */
  meters: number;
  /** Whether this row is the requesting browser. */
  me: boolean;
}

/** GET /api/leaderboard response. */
export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
  /** The requesting browser's own row, even when outside the top; null if it has no votes. */
  me: LeaderboardRow | null;
  /** How many browsers have voted in the period. */
  raters: number;
}

/** Where a point came from: the OSM seed or a person adding it on the spot. */
export type PointSource = "osm" | "user";

/** A step-free way in or out: an elevator or a ramp. */
export type AccessKind = "elevator" | "ramp";

export interface AccessPointProperties {
  id: string;
  kind: AccessKind;
  source: PointSource;
  /** Nearest station or entrance name for OSM elevators; null for user points. */
  label: string | null;
  /** OSM level tag, e.g. "0;-1", if any. */
  level: string | null;
}

export type AccessPointFeature = Feature<Point, AccessPointProperties>;
export type AccessPointsGeoJSON = FeatureCollection<Point, AccessPointProperties>;

export interface AccessPointRow {
  id: string;
  kind: AccessKind;
  source: PointSource;
  label: string | null;
  level: string | null;
  geojson: Point;
}

export interface UnderpassProperties {
  id: string;
  source: PointSource;
  /** Nearest street name(s), or null. */
  name: string | null;
  /** A ramp access point lies within RAMP_RADIUS_M of this underpass. */
  has_ramp_nearby: boolean;
  /** Votes saying "no ramps here". */
  no_ramp_votes: number;
  /** Votes saying "there is a ramp". */
  ramp_votes: number;
  /** The requesting browser's own vote, if any. */
  my_vote: boolean | null;
}

export type UnderpassFeature = Feature<Point, UnderpassProperties>;
export type UnderpassesGeoJSON = FeatureCollection<Point, UnderpassProperties>;

export interface UnderpassRow {
  id: string;
  source: PointSource;
  name: string | null;
  geojson: Point;
}

/** What people can add to the map on the spot. */
export type AddableKind = AccessKind | "underpass";

/** The point-of-interest currently open in a panel. */
export type SelectedPoi =
  | { kind: "access"; feature: AccessPointFeature }
  | { kind: "underpass"; feature: UnderpassFeature };
