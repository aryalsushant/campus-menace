import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { useGame, setGame } from '../game/core/store';
import { api } from '../lib/api';
import { startRun } from './flow';
import { Leaderboard } from './Menus';
import Profile from './Profile.jsx';

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
  const recovering = useGame(s => s.recovering);
  const step = !authReady ? 'loading' : !session ? 'auth' : recovering ? 'newpass' : !profile ? 'username' : 'ready';
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
        {step === 'newpass' && <NewPasswordCard key="newpass" />}
        {step === 'username' && <UsernameCard key="username" />}
        {step === 'ready' && <ReadyCard key="ready" />}
      </AnimatePresence>
    </div>
  );
}

function AuthCard() {
  const notice = useGame(s => s.authNotice);
  // signin | signup | sent (check your inbox) | forgot | reset-sent
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const name = useUsernameCheck(mode === 'signup' ? username : '');
  const go = m => {
    setMode(m);
    setErr('');
    setInfo('');
    setUnconfirmed(false);
    if (notice) setGame({ authNotice: null });
  };
  const run = async fn => {
    setErr('');
    setInfo('');
    if (notice) setGame({ authNotice: null });
    if (!api.available) return setErr('The game server isn’t configured.');
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = e => {
    e.preventDefault();
    if (mode === 'signin')
      run(async () => {
        setUnconfirmed(false);
        try {
          await api.signIn(email, password);
        } catch (x) {
          if (/confirm your email/i.test(x.message)) setUnconfirmed(true);
          throw x;
        }
      });
    else if (mode === 'signup') {
      if (name.problem) return setErr(name.problem);
      if (password.length < 8) return setErr('Use at least 8 characters for your password.');
      run(async () => {
        await api.signUp(email, password, username);
        setPassword('');
        setMode('sent');
      });
    } else if (mode === 'forgot')
      run(async () => {
        await api.sendPasswordReset(email);
        setMode('reset-sent');
      });
  };
  const resend = () => run(async () => {
    await api.resendConfirmation(email);
    setErr('');
    setUnconfirmed(false);
    setInfo('Sent. Check your inbox (and spam).');
  });

  if (mode === 'sent' || mode === 'reset-sent') {
    const signup = mode === 'sent';
    return (
      <motion.div className="cm-card" {...card}>
        <h2>Check your email</h2>
        <p className="cm-muted">
          {signup ? 'We sent a verification link to ' : 'We sent a password reset link to '}
          <b className="cm-email">{email.trim()}</b>.{' '}
          {signup ? 'Tap it to verify your email and you’ll land back here, ready to run.' : 'Tap it to choose a new password.'}
        </p>
        <p className="cm-fine">Not there after a minute? Check your spam folder.</p>
        {err && <p className="cm-error">{err}</p>}
        {info && <p className="cm-hint is-good">{info}</p>}
        <div className="cm-row">
          {signup ? (
            <button type="button" className="cm-link" disabled={busy} onClick={resend}>
              {busy ? 'Sending…' : 'Resend link'}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="cm-link" onClick={() => go('signin')}>
            Back to sign in
          </button>
        </div>
      </motion.div>
    );
  }

  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  return (
    <motion.form className="cm-card" {...card} onSubmit={submit} key={mode}>
      <h2>{signup ? 'Create your account' : forgot ? 'Reset your password' : 'Sign in to run'}</h2>
      <p className="cm-muted">
        {forgot ? 'We’ll email you a link to choose a new one.' : 'Your score goes on the global leaderboard.'}
      </p>
      {notice && !signup && !forgot && <p className={notice.kind === 'bad' ? 'cm-error' : 'cm-notice'}>{notice.text}</p>}
      <label className="cm-field">
        <span>Email</span>
        <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      {signup && (
        <>
          <label className="cm-field">
            <span>Username</span>
            <input maxLength={16} autoComplete="username" spellCheck={false} required value={username} onChange={e => setUsername(e.target.value)} placeholder="pizza_goblin" />
          </label>
          <p className={`cm-hint ${name.bad ? 'is-bad' : name.good ? 'is-good' : ''}`}>{name.text || '3–16 letters, numbers or underscores. Shown on the leaderboard.'}</p>
        </>
      )}
      {!forgot && (
        <label className="cm-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={signup ? 8 : undefined}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={signup ? 'At least 8 characters' : ''}
          />
        </label>
      )}
      {err && <p className="cm-error">{err}</p>}
      {info && <p className="cm-hint is-good">{info}</p>}
      {unconfirmed && (
        <button type="button" className="cm-link" disabled={busy} onClick={resend}>
          Resend the verification link
        </button>
      )}
      <button className="cm-btn cm-btn--primary" disabled={busy || (signup && (name.bad || name.checking))}>
        {busy ? 'One sec…' : signup ? 'Create account' : forgot ? 'Send reset link' : 'Sign in'}
      </button>
      {signup ? (
        <p className="cm-fine">
          Already have an account?{' '}
          <button type="button" className="cm-link" onClick={() => go('signin')}>
            Sign in
          </button>
        </p>
      ) : forgot ? (
        <p className="cm-fine">
          <button type="button" className="cm-link" onClick={() => go('signin')}>
            Back to sign in
          </button>
        </p>
      ) : (
        <div className="cm-row">
          <button type="button" className="cm-link" onClick={() => go('signup')}>
            Create an account
          </button>
          <button type="button" className="cm-link" onClick={() => go('forgot')}>
            Forgot password?
          </button>
        </div>
      )}
    </motion.form>
  );
}

// Shown after a password-reset link signs the player in.
function NewPasswordCard() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (password.length < 8) return setErr('Use at least 8 characters for your password.');
    setBusy(true);
    setErr('');
    try {
      await api.setPassword(password);
      setGame({ recovering: false, authNotice: { kind: 'good', text: 'Password updated.' } });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.form className="cm-card" {...card} onSubmit={submit}>
      <h2>Choose a new password</h2>
      <label className="cm-field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </label>
      {err && <p className="cm-error">{err}</p>}
      <button className="cm-btn cm-btn--primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save password'}
      </button>
      <button type="button" className="cm-link" onClick={() => api.signOut()}>
        Sign out
      </button>
    </motion.form>
  );
}

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'support', 'campusmenace', 'campus_menace', 'official', 'staff', 'system', 'root', 'null', 'undefined'];

function usernameProblem(name) {
  if (!name) return 'Pick a username.';
  if (!/^[A-Za-z0-9_]*$/.test(name)) return 'Letters, numbers and underscores only.';
  if (name.length < 3) return 'At least 3 characters.';
  if (name.length > 16) return 'At most 16 characters.';
  if (matcher.hasMatch(name.replace(/_/g, ' ')) || matcher.hasMatch(name)) return 'Pick something friendlier.';
  if (RESERVED.includes(name.toLowerCase())) return 'That username is reserved.';
  return '';
}

// Live format + availability check for a username field.
function useUsernameCheck(name) {
  const [remote, setRemote] = useState({ checking: false, available: null, msg: '' });
  const seq = useRef(0);
  const local = useMemo(() => (name ? usernameProblem(name) : ''), [name]);
  useEffect(() => {
    if (!name || local) {
      setRemote({ checking: false, available: null, msg: '' });
      return undefined;
    }
    const id = ++seq.current;
    setRemote(s => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try {
        const ok = await api.usernameAvailable(name);
        if (id === seq.current) setRemote({ checking: false, available: ok, msg: ok ? 'Available' : 'Taken' });
      } catch (x) {
        if (id === seq.current) setRemote({ checking: false, available: null, msg: x.message });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name, local]);
  const bad = !!local || remote.available === false;
  return {
    bad,
    good: !bad && remote.available === true,
    checking: remote.checking,
    problem: usernameProblem(name) || (remote.available === false ? 'That username is taken.' : ''),
    text: local || (remote.checking ? 'Checking…' : remote.msg),
  };
}

function UsernameCard() {
  const session = useGame(s => s.session);
  const wanted = (session && session.user && session.user.user_metadata && session.user.user_metadata.username) || '';
  const [name, setName] = useState(wanted);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = useUsernameCheck(name);
  const submit = async e => {
    e.preventDefault();
    if (check.problem) return setErr(check.problem);
    setBusy(true);
    setErr('');
    try {
      const p = await api.claimUsername(name);
      setGame({ profile: p });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.form className="cm-card" {...card} onSubmit={submit}>
      <h2>Pick your username</h2>
      <p className="cm-muted">
        {wanted ? `“${wanted}” isn’t available any more. Pick another one.` : 'This is how you show up on the leaderboard. You can’t change it later.'}
      </p>
      <label className="cm-field">
        <span>Username</span>
        <input autoFocus maxLength={16} autoComplete="off" spellCheck={false} value={name} onChange={e => setName(e.target.value)} placeholder="pizza_goblin" />
      </label>
      <p className={`cm-hint ${check.bad ? 'is-bad' : check.good ? 'is-good' : ''}`}>{err || check.text || '3–16 letters, numbers or underscores'}</p>
      <button className="cm-btn cm-btn--primary" disabled={busy || !name || check.bad || check.checking}>
        {busy ? 'Saving…' : 'Claim it'}
      </button>
      <button type="button" className="cm-link" onClick={() => api.signOut()}>
        Sign out
      </button>
    </motion.form>
  );
}

function ReadyCard() {
  // keep the name on screen while the card animates out after signing out
  const current = useGame(s => s.profile);
  const last = useRef(current);
  if (current) last.current = current;
  const profile = last.current;
  const touch = useGame(s => s.touch);
  const stats = useGame(s => s.stats);
  const notice = useGame(s => s.authNotice);
  const [board, setBoard] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    let live = true;
    api.myStats().then(s => live && setGame({ stats: s })).catch(() => {});
    api.leaderboard('all').then(b => live && setBoard(b)).catch(() => setBoard([]));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setGame({ authNotice: null }), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <>
      <motion.div className="cm-card cm-card--ready" {...card}>
        {notice && notice.kind === 'good' && <p className="cm-notice">{notice.text}</p>}
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
          <button className="cm-link" onClick={() => setShowProfile(true)}>
            Profile
          </button>
          <button className="cm-link" onClick={() => api.signOut()}>
            Sign out
          </button>
        </div>
      </motion.div>
      <AnimatePresence>{showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}</AnimatePresence>
      <AnimatePresence>{showProfile && <Profile onClose={() => setShowProfile(false)} />}</AnimatePresence>
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
      <li><kbd>↑</kbd> / <kbd>W</kbd> jump, again to double jump</li>
      <li><kbd>↓</kbd> slide</li>
      <li><kbd>Space</kbd> throw a can straight ahead</li>
    </ul>
  );
}
