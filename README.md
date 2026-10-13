# Campus Menace

Dodge e-scooter riders, take them down with energy drink cans, and grab every
free pizza slice on the way. A 3D runner for phone and desktop browsers, built
with React Three Fiber and Supabase.

## Setup

```sh
npm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
npm run dev
```

- `npm test` runs the simulation unit tests.
- `npm run seed:demo` creates demo accounts (needs `SUPABASE_SECRET_KEY` in `.env.local`).

See [docs/PLAN.md](docs/PLAN.md) for the design and architecture.
