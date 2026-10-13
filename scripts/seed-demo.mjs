// Creates demo accounts for testing (npm run seed:demo).
// Needs SUPABASE_SECRET_KEY in .env.local. Credentials are written back to
// .env.local (gitignored) and never printed.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local');
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const DEMOS = [
  { key: 'DEMO1', email: 'demo1@campusmenace.test', username: 'pizza_goblin', runs: 14, skill: 1.0 },
  { key: 'DEMO2', email: 'demo2@campusmenace.test', username: 'scooter_slayer', runs: 9, skill: 0.8 },
  { key: 'DEMO3', email: 'demo3@campusmenace.test', username: 'late_to_class', runs: 5, skill: 0.55 },
  { key: 'DEMO4', email: 'demo4@campusmenace.test', username: null, runs: 0, skill: 0 }, // fresh: tests the username screen
];
const CAUSES = ['scooter', 'scooter', 'scooter', 'faceplant', 'fall'];

const envPath = new URL('../.env.local', import.meta.url);
let env = readFileSync(envPath, 'utf8');
const setEnv = (k, v) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
};

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;

for (const d of DEMOS) {
  const password = randomBytes(12).toString('base64url');
  let user = list.users.find(u => u.email === d.email);
  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
    await admin.from('runs').delete().eq('user_id', user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: d.email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  if (d.username) {
    const { error } = await admin.from('profiles').insert({ id: user.id, username: d.username });
    if (error) throw error;
    const runs = [];
    for (let i = 0; i < d.runs; i++) {
      const distance = Math.round(300 + Math.random() * 2600 * d.skill);
      const duration = Math.round((distance / 15) * 1000);
      const finished = new Date(Date.now() - Math.random() * 10 * 86400e3);
      runs.push({
        user_id: user.id,
        seed: Math.floor(Math.random() * 2 ** 31),
        started_at: new Date(finished.getTime() - duration).toISOString(),
        finished_at: finished.toISOString(),
        status: 'done',
        score: Math.round(distance * (0.09 + Math.random() * 0.05)),
        distance,
        takedowns: Math.round((distance / 600) * Math.random() * 3),
        close_calls: Math.round((distance / 300) * Math.random() * 3),
        duration_ms: duration,
        cause: CAUSES[Math.floor(Math.random() * CAUSES.length)],
      });
    }
    const { error: runErr } = await admin.from('runs').insert(runs);
    if (runErr) throw runErr;
  }
  setEnv(`${d.key}_EMAIL`, d.email);
  setEnv(`${d.key}_PASSWORD`, password);
  console.log(`ok ${d.email}${d.username ? ` (${d.username}, ${d.runs} runs)` : ' (no username yet)'}`);
}

writeFileSync(envPath, env);
console.log('Demo credentials written to .env.local');
