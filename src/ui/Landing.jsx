import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame, setGame } from '../game/core/store';
import { api } from '../lib/api';
import { startRun, startTutorial, needsTutorial, prepareTutorial } from './flow';
import { Leaderboard } from './Menus';
import Profile from './Profile.jsx';
import { useUsernameCheck } from './username';
import { suggestEmail } from './emailTypos';
import { UniversityPicker, saveUniversity, needsUniversity, markUniversityAsked } from './University';

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
  const askUniversity = useGame(s => needsUniversity(s));
  const step = !authReady ? 'loading' : !session ? 'auth' : recovering ? 'newpass' : askUniversity ? 'university' : 'ready';
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
        {step === 'university' && <UniversityCard key="university" />}
        {step === 'ready' && <ReadyCard key="ready" />}
      </AnimatePresence>
      <p className="cm-legal-links">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </p>
    </div>
  );
}

export function PlayerNotice() {
  const notice = useGame(s => s.playerNotice);
  if (!notice) return null;
  return (
    <motion.div className="cm-overlay cm-overlay--top" {...card}>
      <motion.div className="cm-card" {...card}>
        <p className="cm-eyebrow">NOTICE</p>
        <p className="cm-muted">{notice.message}</p>
        <button className="cm-btn cm-btn--primary" autoFocus onClick={() => setGame({ playerNotice: null })}>
          I understand
        </button>
      </motion.div>
    </motion.div>
  );
}

function AuthCard() {
  const notice = useGame(s => s.authNotice);
  // signin | signup | sent (check your inbox) | forgot | reset-sent
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [offer, setOffer] = useState(false); // "no account for this email: sign up?"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const emailRef = useRef(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const suggestion = suggestEmail(email);
  // An email carried over from another form is easy to miss, and a typo in
  // it sends the verification link to a stranger: select it so it's seen
  // and typing replaces it.
  useEffect(() => {
    if (!checkEmail || !emailRef.current) return;
    emailRef.current.focus();
    emailRef.current.select();
    setCheckEmail(false);
  }, [checkEmail, mode]);
  const go = m => {
    setMode(m);
    setErr('');
    setInfo('');
    setUnconfirmed(false);
    if (email.trim() && (m === 'signup' || m === 'forgot')) setCheckEmail(true);
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
          else if (/wrong email or password/i.test(x.message)) {
            // new players often sign in first: offer to make the account
            const known = await api.emailRegistered(email).catch(() => true);
            if (!known) return setOffer(true);
            throw new Error('Wrong password. Try again or reset it below.');
          }
          throw x;
        }
      });
    else if (mode === 'signup') {
      if (password.length < 8) return setErr('Use at least 8 characters for your password.');
      run(createAccount);
    } else if (mode === 'forgot')
      run(async () => {
        await api.sendPasswordReset(email);
        setMode('reset-sent');
      });
  };
  const createAccount = async () => {
    await api.signUp(email, password);
    setPassword('');
    setOffer(false);
    setMode('sent');
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
        <p className="cm-fine">
          Wrong email?{' '}
          <button type="button" className="cm-link" onClick={() => go(signup ? 'signup' : 'forgot')}>
            Fix it
          </button>
        </p>
      </motion.div>
    );
  }

  if (offer)
    return (
      <SignUpOffer
        email={email}
        password={password}
        setPassword={setPassword}
        busy={busy}
        err={err}
        onYes={() => {
          if (password.length < 8) return setErr('Use at least 8 characters for your password.');
          run(createAccount);
        }}
        onNo={() => {
          setOffer(false);
          setErr('');
          setCheckEmail(true);
        }}
      />
    );

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
        <input ref={emailRef} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      {suggestion && (
        <p className="cm-hint is-bad">
          Did you mean{' '}
          <button type="button" className="cm-link" onClick={() => setEmail(suggestion)}>
            {suggestion}
          </button>
          ?
        </p>
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
      <button className="cm-btn cm-btn--primary" disabled={busy}>
        {busy ? 'One sec…' : signup ? 'Create account' : forgot ? 'Send reset link' : 'Sign in'}
      </button>
      {signup && (
        <p className="cm-fine">
          By creating an account you confirm you’re 13 or older and agree to the{' '}
          <a className="cm-link" href="/terms" target="_blank" rel="noopener">
            Terms
          </a>{' '}
          and{' '}
          <a className="cm-link" href="/privacy" target="_blank" rel="noopener">
            Privacy Policy
          </a>
          .
        </p>
      )}
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

// A sign-in with an email that has no account: offer to create one with
// the same email and password, spelling out the email so typos stand out.
function SignUpOffer({ email, password, setPassword, busy, err, onYes, onNo }) {
  const short = password.length < 8;
  // keep the field once shown so it doesn't vanish mid-typing at 8 characters
  const [askPassword] = useState(short);
  return (
    <motion.form
      className="cm-card cm-card--offer"
      {...card}
      role="alertdialog"
      aria-labelledby="cm-offer-title"
      onSubmit={e => {
        e.preventDefault();
        onYes();
      }}
    >
      <h2 id="cm-offer-title">Email not found</h2>
      <p className="cm-muted">
        There’s no account for <b className="cm-email">{email.trim()}</b>. Do you want to sign up instead?
      </p>
      {askPassword && (
        <label className="cm-field">
          <span>Choose a password</span>
          <input type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </label>
      )}
      {err && <p className="cm-error">{err}</p>}
      <button className="cm-btn cm-btn--primary" disabled={busy} autoFocus={!askPassword}>
        {busy ? 'One sec…' : 'Yes, sign me up'}
      </button>
      <button type="button" className="cm-link" onClick={onNo}>
        No, let me fix my email
      </button>
      <p className="cm-fine">
        We’ll email you a link to verify it. By signing up you confirm you’re 13 or older and agree to the{' '}
        <a className="cm-link" href="/terms" target="_blank" rel="noopener">
          Terms
        </a>{' '}
        and{' '}
        <a className="cm-link" href="/privacy" target="_blank" rel="noopener">
          Privacy Policy
        </a>
        .
      </p>
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

function UniversityCard() {
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (!pick) return;
    setBusy(true);
    setErr('');
    try {
      await saveUniversity(pick);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  return (
    <motion.form className="cm-card cm-card--university" {...card} onSubmit={submit}>
      <h2>Where do you go to school?</h2>
      <p className="cm-muted">Optional. Pick your university to get its own leaderboard next to the global one.</p>
      <UniversityPicker value={pick} onPick={setPick} autoFocus />
      {err && <p className="cm-error">{err}</p>}
      <button className="cm-btn cm-btn--primary" disabled={!pick || busy}>
        {busy ? 'Saving…' : 'Join its leaderboard'}
      </button>
      <button type="button" className="cm-link" onClick={markUniversityAsked}>
        Skip for now
      </button>
      <p className="cm-fine">You can change this any time from your profile.</p>
    </motion.form>
  );
}

// The start screen. New players have no username yet: they see the
// tutorial first, then pick a username right here and start their first run.
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
  const username = profile && profile.username;
  useEffect(() => {
    let live = true;
    api.myStats().then(s => live && setGame({ stats: s })).catch(() => {});
    api.leaderboard('all').then(b => live && setBoard(b)).catch(() => setBoard([]));
    return () => {
      live = false;
    };
  }, [username]); // reload after a rename so the board shows the new name
  const firstTime = useGame(s => needsTutorial(s));
  // new players get the tutorial: build its campus while this screen shows
  useEffect(() => {
    if (firstTime) prepareTutorial();
  }, [firstTime]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setGame({ authNotice: null }), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <>
      <motion.div className="cm-card cm-card--ready" {...card}>
        {notice && notice.kind === 'good' && <p className="cm-notice">{notice.text}</p>}
        {profile ? (
          <>
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
            {firstTime ? <p className="cm-fine">First time? A quick tutorial shows you the controls.</p> : <Controls touch={touch} />}
          </>
        ) : firstTime ? (
          <>
            <div className="cm-ready-head">
              <div>
                <h2>Welcome!</h2>
                <p className="cm-muted">Let’s learn the controls first. It takes about a minute.</p>
              </div>
            </div>
            <button className="cm-btn cm-btn--start" onClick={() => startRun()} autoFocus>
              <span className="cm-start-pulse" />
              {touch ? 'TAP TO START' : 'PRESS ENTER TO START'}
            </button>
          </>
        ) : (
          <NameAndStart touch={touch} />
        )}
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
          {profile && (
            <button className="cm-link" onClick={() => setShowProfile(true)}>
              Profile
            </button>
          )}
          <button className="cm-link" onClick={() => startTutorial()}>
            Tutorial
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

// After the tutorial: pick a username, then straight into the first run.
function NameAndStart({ touch }) {
  const session = useGame(s => s.session);
  // accounts from before this flow may have asked for a name that's since been taken
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
      startRun();
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="cm-name-start" onSubmit={submit}>
      <h2>Pick a username</h2>
      <p className="cm-muted">{wanted ? `“${wanted}” isn’t available any more. Pick another one.` : 'This is how you show up on the leaderboard.'}</p>
      <label className="cm-field">
        <span>Username</span>
        <input autoFocus maxLength={16} autoComplete="off" spellCheck={false} value={name} onChange={e => setName(e.target.value)} placeholder="pizza_goblin" />
      </label>
      <p className={`cm-hint ${check.bad ? 'is-bad' : check.good ? 'is-good' : ''}`}>{err || check.text || '3–16 letters, numbers or underscores'}</p>
      <button className="cm-btn cm-btn--start" disabled={busy || !name || check.bad || check.checking}>
        <span className="cm-start-pulse" />
        {busy ? 'STARTING…' : touch ? 'START GAME' : 'START GAME (ENTER)'}
      </button>
    </form>
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
