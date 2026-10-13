# Campus Menace

Dodge e-scooter riders, take them down with energy drink cans, and grab every
free pizza slice on the way. A 3D runner for phone and desktop browsers, built
with React Three Fiber and Supabase.

## Play

| | Laptop | Phone |
|---|---|---|
| Steer | ← / → | Tilt (or drag a thumb) |
| Jump, double jump | ↑ or Space | Swipe up |
| Slide | ↓ | Swipe down |
| Throw a can | Enter (straight ahead) | Tap a rider |
| Sprint | Shift | – |
| Pause | Esc / P | ❚❚ button |

Score is pizza. You start with 5 cans; vending machines restock you to 8.
Touching a rider ends the run. Hitting an obstacle makes you stumble and drop
slices; two stumbles in a row is a faceplant.

## Setup

```sh
npm install
cp .env.example .env.local   # Supabase URL, publishable key, secret key
npm run dev
```

- `npm test` runs the simulation tests (physics, determinism, fairness, bot playtests).
- `npm run seed:demo` creates or resets the demo accounts and writes their
  credentials to `.env.local` (`DEMO1_*` … `DEMO4_*`). `DEMO4` has no username,
  for testing the username screen.
- `npx supabase db push` applies `supabase/migrations` to the linked project.
- `node --env-file=.env.local scripts/dev/api-check.mjs` checks the RPCs and
  security rules end to end.
- `npx tsx scripts/dev/survey.mjs 40 5000` measures how far the bot gets.

Never commit `.env.local`. The secret key is only used by scripts, never by
the browser.

## Layout

```
src/game/sim      deterministic simulation (no three.js), unit tested
src/game/render   React Three Fiber scene
src/game/input    keyboard, tilt, swipe and tap controls
src/game/audio    synthesized sound effects and music
src/ui            landing, HUD, menus, run lifecycle
src/lib/api.js    Supabase client
supabase/         schema, RLS and RPC functions
```

See [docs/PLAN.md](docs/PLAN.md) for the design.
