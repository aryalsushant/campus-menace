import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useGame, setGame } from '../game/core/store';
import { api } from '../lib/api';

const overlay = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const pop = { initial: { y: 30, scale: 0.96, opacity: 0 }, animate: { y: 0, scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 22 } }, exit: { y: 12, opacity: 0 } };

const day = iso => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '–');
const ago = iso => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return day(iso);
};

export default function Profile({ onClose }) {
  const profile = useGame(s => s.profile);
  const [account, setAccount] = useState(null);
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    let live = true;
    api.account().then(a => live && setAccount(a)).catch(() => {});
    api.myStats().then(s => live && setStats(s)).catch(() => {});
    api.recentRuns().then(r => live && setRuns(r)).catch(() => live && setRuns([]));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!profile) return null;
  return (
    <motion.div className="cm-overlay cm-overlay--top" {...overlay} onClick={onClose}>
      <motion.div className="cm-card cm-card--board cm-card--profile" {...pop} onClick={e => e.stopPropagation()} role="dialog" aria-label="Your profile">
        <div className="cm-board-head">
          <h2>{profile.username}</h2>
          <button className="cm-icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cm-profile-scroll">
          <p className="cm-muted">
            {account ? account.email : '…'}
            <br />
            <small>Playing since {day(account && account.createdAt)}</small>
          </p>

          <div className="cm-statgrid">
            <div>
              <b>🍕 {stats ? stats.best : '–'}</b>
              <span>best</span>
            </div>
            <div>
              <b>{stats && stats.rank ? `#${stats.rank}` : '–'}</b>
              <span>rank</span>
            </div>
            <div>
              <b>{stats ? stats.total_runs : '–'}</b>
              <span>runs</span>
            </div>
            <div>
              <b>{stats ? `${Math.round(stats.longest || 0)} m` : '–'}</b>
              <span>longest</span>
            </div>
          </div>

          <section className="cm-section">
            <h3>Recent runs</h3>
            {!runs && <div className="cm-spinner" />}
            {runs && runs.length === 0 && <p className="cm-muted">No runs yet. Go get some pizza.</p>}
            {runs &&
              runs.map((r, i) => (
                <div key={i} className="cm-run-row">
                  <i>🍕 {r.score}</i>
                  <span>{Math.round(r.distance)} m</span>
                  <small>{ago(r.finished_at)}</small>
                </div>
              ))}
          </section>

          <ChangePassword />
          <DataAndDeletion username={profile.username} onDeleted={onClose} />

          <div className="cm-row">
            <button className="cm-link" onClick={() => api.signOut()}>
              Sign out
            </button>
            <span className="cm-fine">
              <a className="cm-link" href="/privacy" target="_blank" rel="noopener">
                Privacy
              </a>{' '}
              ·{' '}
              <a className="cm-link" href="/terms" target="_blank" rel="noopener">
                Terms
              </a>
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const submit = async e => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ bad: true, text: 'Use at least 8 characters.' });
    setBusy(true);
    setMsg(null);
    try {
      await api.setPassword(pw);
      setPw('');
      setOpen(false);
      setMsg({ bad: false, text: 'Password changed.' });
    } catch (x) {
      setMsg({ bad: true, text: x.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="cm-section">
      <h3>Password</h3>
      {open ? (
        <form className="cm-inline-form" onSubmit={submit}>
          <input type="password" autoComplete="new-password" autoFocus required minLength={8} value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (8+ characters)" aria-label="New password" />
          <button className="cm-btn cm-btn--primary cm-btn--small" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : (
        <button className="cm-btn cm-btn--small" onClick={() => setOpen(true)}>
          Change password
        </button>
      )}
      {msg && <p className={`cm-hint ${msg.bad ? 'is-bad' : 'is-good'}`}>{msg.text}</p>}
    </section>
  );
}

function DataAndDeletion({ username, onDeleted }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const download = async () => {
    setBusy('export');
    setErr('');
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `campus-menace-${username}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy('');
    }
  };
  const remove = async e => {
    e.preventDefault();
    if (typed.trim().toLowerCase() !== username.toLowerCase()) return;
    setBusy('delete');
    setErr('');
    try {
      await api.deleteAccount();
      setGame({ authNotice: { kind: 'good', text: 'Your account and all its data were deleted.' } });
      onDeleted();
    } catch (x) {
      setErr(x.message);
      setBusy('');
    }
  };
  return (
    <section className="cm-section">
      <h3>Your data</h3>
      <p className="cm-fine cm-left">Download a copy of everything we store about you: your email, username and every run.</p>
      <button className="cm-btn cm-btn--small" onClick={download} disabled={!!busy}>
        {busy === 'export' ? 'Preparing…' : 'Download my data'}
      </button>
      <div className="cm-danger">
        {confirming ? (
          <form onSubmit={remove} className="cm-danger-form">
            <p className="cm-left">
              This permanently deletes your account, your username and all your runs, and removes you from the leaderboard. It can’t be undone. Type <b>{username}</b> to confirm.
            </p>
            <input autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={e => setTyped(e.target.value)} aria-label="Type your username to confirm" />
            <div className="cm-row">
              <button type="button" className="cm-link" onClick={() => (setConfirming(false), setTyped(''))}>
                Cancel
              </button>
              <button className="cm-btn cm-btn--danger cm-btn--small" disabled={busy === 'delete' || typed.trim().toLowerCase() !== username.toLowerCase()}>
                {busy === 'delete' ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </form>
        ) : (
          <button className="cm-link cm-link--danger" onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        )}
      </div>
      {err && <p className="cm-error">{err}</p>}
    </section>
  );
}
