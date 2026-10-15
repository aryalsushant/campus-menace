import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// What an email link brought us back with (read before the client consumes the URL):
// type is 'signup' | 'recovery' | ..., error is a message for an expired or used link.
export const authLink = (() => {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const error = p.get('error_description') || (p.get('error_code') && p.get('error_code').replace(/_/g, ' '));
  return { type: p.get('type'), error: error ? linkError(p.get('error_code'), error) : null };
})();

function linkError(code, msg) {
  if (code === 'otp_expired') return 'That email link has expired or was already used. Sign in to get a new one.';
  return msg.replace(/\+/g, ' ');
}

export const clearAuthLink = () => {
  if (window.location.href.includes('#') || /[?&](error|code|type)=/.test(window.location.search)) window.history.replaceState(window.history.state, '', window.location.pathname);
};

const home = () => `${window.location.origin}/`;

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const unwrap = ({ data, error }) => {
  if (error) throw new Error(friendly(error));
  return data;
};

function friendly(error) {
  const m = error.message || String(error);
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/User already registered/i.test(m)) return 'There’s already an account with that email. Sign in instead.';
  if (/Password should be at least/i.test(m)) return 'Use at least 8 characters for your password.';
  if (/rate limit|only request this after/i.test(m)) return 'Too many emails. Wait a minute and try again.';
  if (/Unable to validate email|invalid format/i.test(m)) return 'That email address doesn’t look right.';
  if (/New password should be different/i.test(m)) return 'Pick a password you haven’t used here before.';
  if (/fetch/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}

let profileReq = null;
const PROFILE = 'id, username, university:universities(id, name, city, state)';
let universityList = null;

async function loadProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const rows = unwrap(await supabase.from('profiles').select(PROFILE).eq('id', u.user.id).limit(1));
  if (rows[0]) return rows[0];
  // first sign-in after confirming: claim the username picked at sign-up
  const wanted = u.user.user_metadata && u.user.user_metadata.username;
  if (!wanted) return null;
  try {
    const p = unwrap(await supabase.rpc('claim_username', { p_username: wanted }));
    return { id: p.id, username: p.username, university: null };
  } catch {
    return null; // taken meanwhile: the username screen asks again
  }
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
    const { data } = supabase.auth.onAuthStateChange((e, session) => fn(session, e));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
  },
  // Creates an unconfirmed account; Supabase emails a link back to this site.
  // The username rides along in user metadata and is claimed on first sign-in.
  async signUp(email, password, username) {
    const data = unwrap(await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username }, emailRedirectTo: home() } }));
    // an already-confirmed email comes back with no identities instead of an error
    if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('There’s already an account with that email. Sign in instead.');
    return data;
  },
  async resendConfirmation(email) {
    unwrap(await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: home() } }));
  },
  async sendPasswordReset(email) {
    unwrap(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: home() }));
  },
  async setPassword(password) {
    unwrap(await supabase.auth.updateUser({ password }));
  },
  // the university picker shows once after the first sign-in, picked or not
  async markUniversityAsked() {
    unwrap(await supabase.auth.updateUser({ data: { university_asked: true } }));
  },
  async markTutorialDone() {
    unwrap(await supabase.auth.updateUser({ data: { tutorial_done: true } }));
  },
  async signOut() {
    await supabase.auth.signOut();
  },

  // The initial session and the SIGNED_IN event both load the profile at once;
  // share one request so the first-sign-in username claim runs only once.
  profile() {
    if (!profileReq) profileReq = loadProfile().finally(() => (profileReq = null));
    return profileReq;
  },
  async account() {
    const { data } = await supabase.auth.getUser();
    return data.user ? { email: data.user.email, createdAt: data.user.created_at } : null;
  },
  // Everything stored about the signed-in player, as one JSON-ready object.
  async exportData() {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) throw new Error('Sign in first.');
    const profile = unwrap(await supabase.from('profiles').select('*, university:universities(name, city, state)').eq('id', u.id).limit(1))[0] || null;
    const runs = unwrap(await supabase.from('runs').select('*').eq('user_id', u.id).order('started_at', { ascending: true }));
    const usernameChanges = unwrap(await supabase.from('username_changes').select('old_username, new_username, changed_at').eq('user_id', u.id).order('changed_at', { ascending: true }));
    return {
      exported_at: new Date().toISOString(),
      account: { id: u.id, email: u.email, created_at: u.created_at, email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at },
      profile,
      username_changes: usernameChanges,
      runs,
    };
  },
  // Deletes the account, profile and every run, then clears the local session.
  async deleteAccount() {
    unwrap(await supabase.rpc('delete_my_account'));
    await supabase.auth.signOut({ scope: 'local' });
  },
  async usernameAvailable(name) {
    return unwrap(await supabase.rpc('username_available', { p_username: name }));
  },
  async claimUsername(name) {
    const p = unwrap(await supabase.rpc('claim_username', { p_username: name }));
    return { id: p.id, username: p.username, university: null };
  },
  // [id, name, city, state, alias] for every US university, loaded once
  universities() {
    if (!universityList)
      universityList = fetch('/universities.json')
        .then(r => {
          if (!r.ok) throw new Error('Couldn’t load the university list.');
          return r.json();
        })
        .catch(x => {
          universityList = null;
          throw x;
        });
    return universityList;
  },
  // null clears it
  async setUniversity(id) {
    unwrap(await supabase.rpc('set_university', { p_university: id }));
  },
  // renames are limited to two in any seven days
  async changeUsername(name) {
    return unwrap(await supabase.rpc('change_username', { p_username: name }));
  },
  async usernameChanges() {
    const rows = unwrap(await supabase.rpc('get_username_changes'));
    return rows[0] || { remaining: 2, next_at: null };
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

  async leaderboard(period = 'all', university = null) {
    return unwrap(await supabase.rpc('get_leaderboard', { p_period: period, p_limit: 50, p_university: university }));
  },
  async myStats() {
    const rows = unwrap(await supabase.rpc('get_my_stats'));
    return rows[0] || null;
  },
  async recentRuns() {
    return unwrap(await supabase.rpc('get_recent_runs', { p_limit: 8 }));
  },
};
