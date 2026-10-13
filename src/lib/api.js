import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const unwrap = ({ data, error }) => {
  if (error) throw new Error(friendly(error));
  return data;
};

function friendly(error) {
  const m = error.message || String(error);
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first.';
  if (/fetch/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}

export const api = {
  available: !!supabase,

  async session() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuth(fn) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((_e, session) => fn(session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
  },
  async signOut() {
    await supabase.auth.signOut();
  },

  async profile() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const rows = unwrap(await supabase.from('profiles').select('id, username').eq('id', u.user.id).limit(1));
    return rows[0] || null;
  },
  async usernameAvailable(name) {
    return unwrap(await supabase.rpc('username_available', { p_username: name }));
  },
  async claimUsername(name) {
    return unwrap(await supabase.rpc('claim_username', { p_username: name }));
  },

  async startRun(seed) {
    return unwrap(await supabase.rpc('start_run', { p_seed: seed }));
  },
  async finishRun(runId, r) {
    const rows = unwrap(
      await supabase.rpc('finish_run', {
        p_run: runId,
        p_score: r.score,
        p_distance: r.distance,
        p_takedowns: r.takedowns,
        p_close_calls: r.closeCalls,
        p_duration_ms: r.durationMs,
        p_cause: r.cause,
      })
    );
    const x = rows[0];
    return { status: x.result_status, best: x.best_score, rank: x.best_rank, newBest: x.new_best };
  },

  async leaderboard(period = 'all') {
    return unwrap(await supabase.rpc('get_leaderboard', { p_period: period, p_limit: 50 }));
  },
  async myStats() {
    const rows = unwrap(await supabase.rpc('get_my_stats'));
    return rows[0] || null;
  },
  async recentRuns() {
    return unwrap(await supabase.rpc('get_recent_runs', { p_limit: 8 }));
  },
};
