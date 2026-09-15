# Novometro

A gamified exploration app. Visit stations on a city's transit network to unlock
them, complete lines for achievements, and compete with friends. London (Tube,
DLR, Overground, Elizabeth line) is the first city.

Stack: Expo (React Native), Mapbox, Supabase (Postgres + PostGIS).

## What's in the app

- Sign in with an emailed code; pick a username.
- Map with every Tube, DLR, Overground and Elizabeth line station, drawn in
  line colours, with Tube / DLR / Overground / Elizabeth / Bus filter chips.
- Check in when you are within 150 m of a station. Unlocks, visit counts,
  streaks, XP and levels all come from the server-side visit log.
- Progress: per-line completion bars and an ordered station rail per line.
- Compete: weekly challenge, friends and London leaderboards (this week /
  all time), find friends by username.
- Profile: achievements with shareable cards.

## How it works

- Every visit is an append-only row in `visits`, written **only** by the
  `check_in` database function after it verifies the reported location is
  within range of the station, the accuracy is sane, the user has not already
  checked in there in the last 30 minutes, and the implied travel speed since
  their last visit is plausible.
- Unlocks, visit counts, line progress, and achievements all derive from
  `visits`. Achievements are evaluated in the database on every check-in.
- The client never has write access to `visits` or `user_achievements`.

The schema lives in `supabase/migrations`; the tests in `supabase/tests`.

## Local setup

Prerequisites: Node 22+, Docker Desktop, Xcode or Android Studio.

```bash
npm install
cp .env.example .env
cp scripts/.env.example scripts/.env
```

Start the local database (first run pulls Docker images):

```bash
npm run db:start
```

Fill `.env` and `scripts/.env` using the URL and keys printed by
`npx supabase status`. The app uses the anon/publishable key; the import
script uses the service role key. Add your Mapbox tokens to `.env`.

Apply migrations and seed, then import London:

```bash
npm run db:reset
npm run import:tfl
```

Run the database tests:

```bash
npm run db:test
```

Regenerate TypeScript types after changing a migration:

```bash
npm run db:types
```

## Running the app

Mapbox needs a development build; Expo Go will not work.

```bash
npm run ios
```

## Scripts

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `db:start`        | Start local Supabase in Docker                      |
| `db:stop`         | Stop it                                             |
| `db:reset`        | Recreate the database from migrations and seed      |
| `db:test`         | Run pgTAP tests                                     |
| `db:types`        | Generate `src/lib/database.types.ts`                |
| `import:tfl`      | Import London rail lines, stations, and ordering    |
| `import:tfl:bus`  | Import London bus routes and stops (bus network)    |

## Environment

`.env` holds only values that are safe to ship in the app binary. `scripts/.env`
holds server-side keys and is never read by the app. Both are gitignored; the
`.example` files are the reference.

The Mapbox **secret** download token never goes in the repo or in `.env`. Put it
in your user config once:

```
# ~/.gradle/gradle.properties
MAPBOX_DOWNLOADS_TOKEN=sk....

# ~/.netrc  (chmod 600)
machine api.mapbox.com
  login mapbox
  password sk....
```

## Roadmap

Work is tracked in GitHub issues, grouped into milestones:

1. **Foundation**: schema, verified check-in, data import, cleanup
2. **Core loop**: auth, map, real check-in, line progress
3. **Social and growth**: achievements UI, shareable cards, friends, leaderboards
4. **Launch**: anti-cheat hardening, builds, store listing
