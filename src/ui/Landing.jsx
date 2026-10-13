import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { useGame, setGame } from '../game/core/store';
import { api } from '../lib/api';
import { startRun } from './flow';
import { Leaderboard } from './Menus';

const card = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.18 } },
};

export function Logo({ small }) {
  return (
    <motion.h1 className={`cm-logo ${small ? 'is-small' : ''}`} initial={{ y: -30, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 120, damping: 12 }}>
      <span className="cm-logo-1">CAMPUS</span>
      <span className="cm-logo-2">MENACE</span>
    </motion.h1>
  );
}

export default function Landing() {
  const authReady = useGame(s => s.authReady);
  const session = useGame(s => s.session);
  const profile = useGame(s => s.profile);
  const step = !authReady ? 'loading' : !session ? 'auth' : !profile ? 'username' : 'ready';
  return (
    <div className="cm-landing">
      <div className="cm-landing-top">
        <Logo />
        <motion.p className="cm-tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          Dodge the scooters. Can the scooters. Get the free pizza.
        </motion.p>
      </div>
      <AnimatePresence mode="wait">
        {step === 'loading' && (
          <motion.div key="loading" className="cm-card cm-card--slim" {...card}>
            <div className="cm-spinner" />
          </motion.div>
        )}
        {step === 'auth' && <AuthCard key="auth" />}
        {step === 'username' && <UsernameCard key="username" />}
        {step === 'ready' && <ReadyCard key="ready" />}
      </AnimatePresence>
    </div>
  );
}

function AuthCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setErr('');
    if (!api.available) return setErr('The game server isn’t configured.');
    setBusy(true);
    try {
      await api.signIn(email, password);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.form className="cm-card" {...card} onSubmit={submit}>
      <h2>Sign in to run</h2>
      <p className="cm-muted">Your score goes on the global leaderboard.</p>
      <label className="cm-field">
        <span>Email</span>
        <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@school.edu" />
      </label>
      <label className="cm-field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {err && <p className="cm-error">{err}</p>}
      <button className="cm-btn cm-btn--primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="cm-fine">Sign up with email or Google is coming soon. Testers: use your demo account.</p>
    </motion.form>
  );
}

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

function UsernameCard() {
  const [name, setName] = useState('');
  const [state, setState] = useState({ checking: false, available: null, msg: '' });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const local = useMemo(() => {
    if (!name) return '';
    if (!/^[A-Za-z0-9_]*$/.test(name)) return 'Letters, numbers and underscores only.';
    if (name.length < 3) return 'At least 3 characters.';
    if (name.length > 16) return 'At most 16 characters.';
    if (matcher.hasMatch(name.replace(/_/g, ' ')) || matcher.hasMatch(name)) return 'Pick something friendlier.';
    return '';
  }, [name]);
  useEffect(() => {
    if (!name || local) {
      setState({ checking: false, available: null, msg: '' });
      return undefined;
    }
    const id = ++seq.current;
    setState(s => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try {
        const ok = await api.usernameAvailable(name);
        if (id === seq.current) setState({ checking: false, available: ok, msg: ok ? 'Available' : 'Taken' });
      } catch (x) {
        if (id === seq.current) setState({ checking: false, available: null, msg: x.message });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name, local]);
  const submit = async e => {
    e.preventDefault();
    if (local || !name) return;
    setBusy(true);
    try {
      const p = await api.claimUsername(name);
      setGame({ profile: p });
    } catch (x) {
      setState({ checking: false, available: false, msg: x.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.form className="cm-card" {...card} onSubmit={submit}>
      <h2>Pick your username</h2>
      <p className="cm-muted">This is how you show up on the leaderboard. You can’t change it later.</p>
      <label className="cm-field">
        <span>Username</span>
        <input autoFocus maxLength={16} autoComplete="off" spellCheck={false} value={name} onChange={e => setName(e.target.value)} placeholder="pizza_goblin" />
      </label>
      <p className={`cm-hint ${local || state.available === false ? 'is-bad' : state.available ? 'is-good' : ''}`}>
        {local || (state.checking ? 'Checking…' : state.msg) || '3–16 letters, numbers or underscores'}
      </p>
      <button className="cm-btn cm-btn--primary" disabled={busy || !!local || !name || state.available === false || state.checking}>
        {busy ? 'Saving…' : 'Claim it'}
      </button>
      <button type="button" className="cm-link" onClick={() => api.signOut()}>
        Sign out
      </button>
    </motion.form>
  );
}

function ReadyCard() {
  const profile = useGame(s => s.profile);
  const touch = useGame(s => s.touch);
  const stats = useGame(s => s.stats);
  const [board, setBoard] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  useEffect(() => {
    let live = true;
    api.myStats().then(s => live && setGame({ stats: s })).catch(() => {});
    api.leaderboard('all').then(b => live && setBoard(b)).catch(() => setBoard([]));
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <motion.div className="cm-card cm-card--ready" {...card}>
        <div className="cm-ready-head">
          <div>
            <p className="cm-muted">Signed in as</p>
            <h2>{profile.username}</h2>
          </div>
          <div className="cm-best">
            <span>🍕 {stats ? stats.best : '–'}</span>
            <small>{stats && stats.rank ? `#${stats.rank} worldwide` : 'no runs yet'}</small>
          </div>
        </div>
        <button className="cm-btn cm-btn--start" onClick={() => startRun()} autoFocus>
          <span className="cm-start-pulse" />
          {touch ? 'TAP TO RUN' : 'PRESS ENTER TO RUN'}
        </button>
        <Controls touch={touch} />
        {board && board.length > 0 && (
          <div className="cm-mini-board">
            {board.slice(0, 5).map(r => (
              <div key={r.username} className={r.is_me ? 'is-me' : ''}>
                <span>#{r.rank}</span>
                <b>{r.username}</b>
                <i>🍕 {r.best}</i>
              </div>
            ))}
          </div>
        )}
        <div className="cm-row">
          <button className="cm-link" onClick={() => setShowBoard(true)}>
            Full leaderboard
          </button>
          <button className="cm-link" onClick={() => api.signOut()}>
            Sign out
          </button>
        </div>
      </motion.div>
      <AnimatePresence>{showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}</AnimatePresence>
    </>
  );
}

export function Controls({ touch }) {
  const steerMode = useGame(s => s.steerMode);
  if (touch) {
    return (
      <ul className="cm-controls">
        <li><b>{steerMode === 'tilt' ? 'Tilt' : 'Drag'}</b> to steer</li>
        <li><b>Swipe ↑</b> jump (again for a flip)</li>
        <li><b>Swipe ↓</b> slide</li>
        <li><b>Tap a rider</b> to throw a can</li>
      </ul>
    );
  }
  return (
    <ul className="cm-controls">
      <li><kbd>←</kbd><kbd>→</kbd> steer</li>
      <li><kbd>↑</kbd> / <kbd>Space</kbd> jump, again to double jump</li>
      <li><kbd>↓</kbd> slide</li>
      <li><kbd>Enter</kbd> throw a can straight ahead</li>
    </ul>
  );
}
