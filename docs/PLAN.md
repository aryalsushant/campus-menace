# Campus Menace: build plan

A 3D endless runner for desktop and phone browsers. A student with an oversized
backpack runs across a campus that slowly breaks apart into floating chunks
above the clouds. Scooter riders are the menace: dodge them or take them down
with energy drink cans. Score is pizza.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Platform | Web (desktop + mobile browsers), deployed on Vercel |
| Setting | Grounded campus → cracking campus → floating sky campus |
| Score | Pizza slices collected (single number) |
| Riders | Human-sized, cannot be jumped over. Can them or dodge them. Never from behind |
| Rider contact | Ends the run |
| Obstacles | Stumble (lose speed + drop slices). Two stumbles within ~4 s = faceplant, run over |
| Edges | Soft walls (hedges, curbs, railings) scrape and slow you. Only marked gaps kill |
| Cans | Start with 5, vending machine checkpoints restock up to 8 |
| Narrow bridges | Only spawn a rider if you have a can; always a vending machine before |
| Camera | Heading-up follow camera behind the student, path always points up-screen |
| Turns | Path curves are followed automatically; steering is lateral only |
| Desktop | ←/→ steer, ↑/W jump (double jump), ↓ slide, Space throw straight ahead, Shift sprint |
| Mobile | Tilt to steer (drag fallback), swipe up/down jump/slide, tap a rider to throw |
| Accounts | Sign in required before playing; landing page shows an attract-mode run behind the card |
| Auth (phase 1) | Email + password demo accounts only. Email codes (Resend) and Google come later |
| Scope | Core first; replay video, Daily Run, ghosts and cosmetics as later updates |

## Architecture

```
src/
  game/
    sim/        pure, deterministic simulation (no three.js, unit tested)
      rng.js        seeded PRNG
      track.js      centreline curve (arcs + straights), arc-length lookup, elevation
      generator.js  chunk generator: sections, crossings, obstacles, pizza, riders, pickups
      surfaces.js   what you can stand on at (s, d, t): pads, bridges, stones, collapsing planks
      runner.js     the student: fixed-step physics in track space (s, d, y)
      riders.js     scooter rider behaviours
      cans.js       projectiles, aim assist, hits
      world.js      ties it together: step(), events, difficulty, fairness rules
      bot.js        AI player (attract mode + automated fairness tests)
    render/     React Three Fiber scene, reads the sim every frame
    input/      keyboard, touch (tilt, swipe, tap), bot
    audio/      Web Audio synth: SFX + layered music
  ui/           landing, auth, username, HUD, pause, game over, leaderboard, records
  lib/          supabase client, API calls
supabase/migrations/  schema, RLS, RPC functions
scripts/seed-demo.mjs demo accounts + fake score history
```

The simulation works in **track space**: `s` is distance along the path,
`d` is lateral offset from the centreline, `y` is height. Collisions,
pizza lines, rider routes and gaps are all defined in `(s, d)`. That keeps it
small, fast, fair and deterministic, which daily runs and score verification
need later. The renderer maps track space to world space through the curve.

Fixed 60 Hz simulation step with render interpolation (same approach as the
portfolio). Slow-motion scales the sim clock.

## Gameplay systems

- **Runner**: auto-forward speed ramps 9 → 24 m/s. Sprint ×1.2, ease ×0.8.
  Lateral steering with acceleration and banking. Variable jump, double jump,
  coyote time, jump buffer, slide (0.7 s, lower hitbox), soft-wall scrape.
- **Track**: sections 70–140 m (open campus areas, gentle curves, ramps),
  crossings 14–50 m. Crossing types: bridge (wide/narrow), gap (single/double),
  broken bridge, collapsing planks, stepping stones, bounce pad, rooftop drop.
- **Stages** by distance: 0–1.2 km grounded, 1.2–2.6 km cracking,
  2.6 km+ sky. Time of day lerps morning → sunset → neon night.
- **Riders**: oncoming, weaver (slower, same direction), drifter (cuts
  across), pack (formation with one gap), bridge rider. Close call when passing
  within ~1.1 m.
- **Obstacles**: low (jump), high (slide), tall (go around), moving
  (sprinklers, delivery robots, geese).
- **Pizza**: trails that show the safe line. Takedowns drop 3, close calls 1.
- **Power-ups**: pizza box magnet, cold brew (fast + invincible), hoodie
  shield, six-pack (unlimited cans for 8 s).
- **Difficulty director**: speed, rider density and mix, gap width, bridge
  width and vending spacing all scale with distance. Each new obstacle type is
  introduced alone first.
- **Fairness rules** (unit tested): every pattern leaves a passable line;
  gaps are always clearable at current speed; narrow-bridge riders only when
  cans > 0; nothing ever comes from behind.

## Visuals

Stylized low-poly, flat shaded, cinematic lighting. Custom sky and cloud-sea
shaders, wind-swayed foliage, instanced props, soft shadows, bloom, ambient
occlusion on high tier, speed lines, FOV kick, camera shake, can-hit
slow-motion with tumbling riders and spinning scooters. Procedurally animated
student (bouncing backpack) and riders. Quality tiers auto-adjust (low /
medium / high) so phones stay at 60 fps.

## Backend (Supabase)

- `profiles(id → auth.users, username unique case-insensitive)`
- `runs(id, user_id, started_at, finished_at, score, distance, takedowns,
  duration_ms, status)`
- RLS on everything; clients cannot write tables directly.
- RPCs (security definer): `claim_username`, `start_run`, `finish_run`
  (plausibility check against server time), `get_leaderboard(period)`,
  `get_my_stats`.
- Demo accounts seeded with `npm run seed:demo` using the secret key from
  `.env.local` (never committed, never shipped to the browser).

## Milestones

1. Scaffold, plan, tooling
2. Deterministic sim core + tests (track, surfaces, runner, generator)
3. Scene: sky, campus chunks, path, bridges, props, lighting, effects
4. Student character + camera
5. Riders, cans, takedowns, close calls
6. Obstacles, stumbles, pizza, power-ups, vending machines
7. Difficulty director, stages, time of day, fairness tests with the bot
8. Input: keyboard, touch (tilt, swipe, tap), attract-mode bot
9. Audio
10. UI: landing, auth, username, HUD, pause, game over
11. Supabase schema, RPCs, leaderboard, records, demo seed
12. Performance + mobile pass, headless playtests, deploy

Later: email codes via Resend, Google sign-in, death replay + video export,
Daily Run, ghosts, cosmetics, missions.
