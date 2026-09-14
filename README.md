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
| `pnpm seed` | Fetch Sofia roads from Overpass, split/merge into segments, derive intersections, upsert to Supabase and delete stale rows. Add `--dry-run` to only print statistics. |

## Data model

- **segments**: block-length pieces of road, split at real junctions and
  merged back together where OSM had split one street into consecutive ways.
  Minimum 20 m, merged runs capped at 400 m.
- **intersections**: nodes where 3+ segments meet.
- **ratings** / **intersection_ratings**: one vote (0 terrible, 1 passable,
  2 good) per anonymous browser id per target; a repeat vote replaces the old one.
  Medians are recomputed by a Postgres function on every vote.

## Environments & deployment

One hosted Supabase project (`ttihndnczfkdvicszeos`) is used by both local dev and
production for now. The seed and ratings in it are real data.

- The app deploys to **Vercel** (project `sidequest`, team `dgpt1`). Live at
  **https://sidequest-omega-five.vercel.app** (the `sidequest-dgpt1.vercel.app` alias is behind Vercel team SSO). Once the GitHub integration is connected
  (Project Settings → Git) every push to `master` of
  [github.com/tsupepilipep/sidequest](https://github.com/tsupepilipep/sidequest) deploys to
  production and every other branch gets a preview URL. Until then, deploy manually with
  `npx vercel deploy --prod --scope dgpt1` after `npx vercel login`.
- Vercel env vars (Project Settings → Environment Variables), for both Production
  and Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. `SUPABASE_DB_URL` is only for local scripts and
  must not be set on Vercel.
- Schema changes: add a file to `supabase/migrations/` and run `pnpm migrate`
  locally before the code that needs it ships.
- Data refresh: run `pnpm seed` locally whenever the OSM data or the segment
  logic changes. It is idempotent; existing votes survive as long as segment ids
  do not change.
