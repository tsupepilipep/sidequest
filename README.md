# SideQuest — Sofia sidewalk rating map

Rate the quality of sidewalks and intersections in Sofia while you walk.
Next.js + Leaflet on the front, Supabase (Postgres) behind, road data from
OpenStreetMap via Overpass.

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill in the Supabase values
pnpm dev                           # http://localhost:3000
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js as usual |
| `pnpm lint` | ESLint |
| `pnpm migrate` | Apply every file in `supabase/migrations/` with `psql` (needs `SUPABASE_DB_URL`) |
| `pnpm seed:metro` | Fetch Sofia metro elevators (OSM `highway=elevator` nodes within 150 m of a subway station or 50 m of a subway entrance, excluding ones whose `level` tag is underground-only) and upsert them to `access_points` as `source = 'osm'`, deleting stale OSM rows. Never touches user-added rows or any other table. Add `--dry-run` to only print counts. |
| `pnpm seed:underpasses` | Cluster Sofia's OSM pedestrian tunnels into underpasses and upsert one point each to `underpasses` as `source = 'osm'`, named after the nearest street segments. Same guarantees as above. |
| `pnpm seed` | Fetch Sofia roads from Overpass, split/merge into segments, derive intersections, upsert to Supabase and delete stale rows. Add `--dry-run` to only print statistics. |

## Data model

- **segments**: block-length pieces of road, split at real junctions and
  merged back together where OSM had split one street into consecutive ways.
  Minimum 20 m, merged runs capped at 400 m.
- **intersections**: nodes where 3+ segments meet.
- **ratings** / **intersection_ratings**: one vote (0 terrible, 1 passable,
  2 good) per anonymous browser id per target; a repeat vote replaces the old one
  (its `created_at` stays, so a vote is only ever counted once on the leaderboard).
  Medians are recomputed by a Postgres function on every vote.
- **access_points**: elevators and ramps as points. Elevators come from OSM
  (`pnpm seed:metro`, shafts tagged as underground-only are skipped; untagged
  ones are kept since they are usually the street lifts nobody tagged). Ramps,
  and any elevator OSM lacks, are added by users on the spot with the "+" button
  or from an underpass's panel. A user may remove a point they added (the API
  checks `created_by`); ids of a browser's own points are cached in localStorage.
- **access_point_votes**: one "permanently closed" report per browser per
  elevator or ramp, withdrawable. Any report puts a red slash over the marker
  (it keeps its colour; grey means "unknown" elsewhere) and says so in its panel.
- **underpasses**: one point per pedestrian underpass, clustered from OSM tunnel
  ways (`pnpm seed:underpasses`: tunnels sharing a node, or joined by an untagged
  way under 30 m such as the stairs down, form one underpass) or added by a user.
- **underpass_votes**: one vote per browser per underpass, `has_ramp` true/false.
  An underpass shows green when a ramp access point lies within 60 m or "there is
  a ramp" votes outnumber "no ramps", red when there are "no ramps" votes, grey
  otherwise.

## Map

Standard OpenStreetMap tiles, desaturated with a CSS filter on the tile pane
(`globals.css`) so rating colours and markers carry the colour. Tiles are
native to zoom 19 and upscaled to 20. Point markers (elevators, ramps,
underpasses) appear from zoom 16; intersection dots from 16 (15 when rating
intersections).

## Adding points

One flow for elevators, ramps and underpasses (`AddPointSheet`): a crosshair
sits at the map centre, the user pans until it is on the spot, picks the kind
and taps Place. In live mode the map already follows the user, so the crosshair
is where they stand. "Mark the ramp" on an underpass panel opens the same sheet
with Ramp preselected and the map centred on the underpass. Points are
validated to lie inside a loose Sofia bounding box.
- **profiles**: a random nickname (adjective + creature, `src/lib/nicknames.ts`)
  per browser id, created lazily by `/api/profile` or when the browser first
  shows up on the leaderboard. The user can shuffle theirs.
- **leaderboard(p_since)**: Postgres function returning votes and metres of
  sidewalk per browser, served by `/api/leaderboard?period=week|all`. Browser
  ids are the only credential a user has, so the API never returns them.

## Walks and stats

A "walk" is a run of first-time votes with no gap longer than 30 minutes,
tracked in localStorage only (`src/hooks/useWalk.ts`). The trophy button on
the map shows a live tally while a walk is in progress and opens the stats
sheet (nickname, current walk, all-time totals, leaderboard). A walk that has
gone quiet is closed on the next app start and its summary card is shown once.
Nothing in the UI ends a walk explicitly, so switching live mode off to tap a
missed street is still the same walk.

## Environments & deployment

One hosted Supabase project (`ttihndnczfkdvicszeos`) is used by both local dev and
production for now. The seed and ratings in it are real data.

- The app deploys to **Vercel** (project `sidequest`, team `dgpt1`). Live at
  **https://sidequest-omega-five.vercel.app** (the `sidequest-dgpt1.vercel.app` alias is
  behind Vercel team SSO). The project is connected to
  [github.com/tsupepilipep/sidequest](https://github.com/tsupepilipep/sidequest): every push
  to `master` deploys to production and every other branch gets a preview URL. Manual
  deploys are still possible with `npx vercel deploy --prod --scope dgpt1` after
  `npx vercel login`.
- Vercel env vars (Project Settings → Environment Variables), for both Production
  and Preview: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
  `SUPABASE_DB_URL` is only for local scripts and must not be set on Vercel.
- The browser never talks to Supabase directly: all reads and writes go through
  the API routes with the service role key, and RLS is enabled on every table
  with no policies, so the anon/publishable key is unused and must not be
  shipped to the client.
- Schema changes: add a file to `supabase/migrations/` and run `pnpm migrate`
  locally before the code that needs it ships.
- Data refresh: run `pnpm seed` locally whenever the OSM data or the segment
  logic changes. It is idempotent; existing votes survive as long as segment ids
  do not change.
