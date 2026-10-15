import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useGame, setPersisted } from '../game/core/store';
import { api } from '../lib/api';
import { startRun, backToMenu, togglePause } from './flow';
import { UniversityPicker, saveUniversity, place } from './University';

const overlay = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const pop = { initial: { y: 30, scale: 0.96, opacity: 0 }, animate: { y: 0, scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 22 } }, exit: { y: 12, opacity: 0 } };

export function PauseMenu() {
  const muted = useGame(s => s.muted);
  const quality = useGame(s => s.quality);
  const touch = useGame(s => s.touch);
  const steerMode = useGame(s => s.steerMode);
  const tilt = useGame(s => s.tiltSensitivity);
  return (
    <motion.div className="cm-overlay" {...overlay}>
      <motion.div className="cm-card" {...pop}>
        <h2>Paused</h2>
        <button className="cm-btn cm-btn--primary" onClick={togglePause} autoFocus>
          Resume
        </button>
        <div className="cm-setting">
          <span>Sound</span>
          <button className={`cm-toggle ${muted ? '' : 'is-on'}`} aria-pressed={!muted} onClick={() => setPersisted({ muted: !muted })}>
            <i />
          </button>
        </div>
        <div className="cm-setting">
          <span>Graphics</span>
          <div className="cm-seg">
            {['auto', 'low', 'medium', 'high'].map(q => (
              <button key={q} className={quality === q ? 'is-on' : ''} onClick={() => setPersisted({ quality: q })}>
                {q}
              </button>
            ))}
          </div>
        </div>
        {touch && (
          <>
            <div className="cm-setting">
              <span>Steering</span>
              <div className="cm-seg">
                {['tilt', 'drag'].map(m => (
                  <button key={m} className={steerMode === m ? 'is-on' : ''} onClick={() => setPersisted({ steerMode: m })}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {steerMode === 'tilt' && (
              <label className="cm-setting">
                <span>Tilt sensitivity</span>
                <input type="range" min="0.5" max="2" step="0.1" value={tilt} onChange={e => setPersisted({ tiltSensitivity: +e.target.value })} />
              </label>
            )}
          </>
        )}
        <button className="cm-btn" onClick={backToMenu}>
          Quit to menu
        </button>
      </motion.div>
    </motion.div>
  );
}

const LINES = {
  scooter: [
    'Flattened by a guy doing 22 mph while FaceTiming.',
    'Scooter: 1. You: 0.',
    'They were late for their 8 a.m. You were in the way.',
    'Hit by someone who has never once used a bell.',
    'Run over by a scooter with 3% battery and 100% confidence.',
  ],
  faceplant: ['Tripped. Twice. In front of everyone.', 'Faceplanted. The tour group took photos.', 'Your shoelaces filed a complaint.'],
  fall: ['Fell off campus. Literally.', 'Took the shortcut. There was no shortcut.', 'Gravity: undefeated.'],
};
const FALL_BY_STAGE = ['Fell into the creek. The geese saw everything.', 'Fell into a construction pit. Hard hat not included.', 'Fell off a floating island. Bold strategy.'];

export function GameOver() {
  const r = useGame(s => s.result);
  const touch = useGame(s => s.touch);
  const [board, setBoard] = useState(false);
  const line = useMemo(() => {
    if (!r) return '';
    if (r.cause === 'fall' && Math.random() < 0.6) return FALL_BY_STAGE[r.stage] || LINES.fall[0];
    const list = LINES[r.cause] || LINES.scooter;
    return list[Math.floor(Math.random() * list.length)];
  }, [r && r.durationMs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  return (
    <motion.div className="cm-overlay cm-overlay--over" {...overlay}>
      <motion.div className="cm-card cm-card--over" {...pop}>
        <p className="cm-eyebrow">{r.cause === 'scooter' ? 'WIPED OUT' : r.cause === 'fall' ? 'OFF THE EDGE' : 'FACEPLANT'}</p>
        <p className="cm-death-line">{line}</p>
        <div className="cm-final">
          <span>🍕</span>
          <b>{r.score}</b>
        </div>
        {r.newBest && <div className="cm-newbest">NEW PERSONAL BEST!</div>}
        <div className="cm-statgrid">
          <div>
            <b>{r.distance} m</b>
            <span>distance</span>
          </div>
          <div>
            <b>{r.takedowns}</b>
            <span>takedowns</span>
          </div>
          <div>
            <b>{r.closeCalls}</b>
            <span>close calls</span>
          </div>
          <div>
            <b>×{r.maxCombo}</b>
            <span>best combo</span>
          </div>
        </div>
        <p className="cm-submit">
          {r.submit === 'pending' && 'Saving your run…'}
          {r.submit === 'saved' && `Best 🍕 ${r.best} · #${r.rank} worldwide`}
          {r.submit === 'rejected' && 'This run couldn’t be verified, so it wasn’t saved.'}
          {r.submit === 'failed' && 'Couldn’t save this run (offline?).'}
        </p>
        <button className="cm-btn cm-btn--start" onClick={() => startRun()} autoFocus>
          {touch ? 'RUN AGAIN' : 'RUN AGAIN (ENTER)'}
        </button>
        <div className="cm-row">
          <button className="cm-link" onClick={() => setBoard(true)}>
            Leaderboard
          </button>
          <button className="cm-link" onClick={backToMenu}>
            Menu
          </button>
        </div>
      </motion.div>
      {board && <Leaderboard onClose={() => setBoard(false)} />}
    </motion.div>
  );
}

export function Leaderboard({ onClose }) {
  const university = useGame(s => s.profile && s.profile.university);
  const [scope, setScope] = useState(university ? 'school' : 'global');
  const [period, setPeriod] = useState('all');
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const locked = scope === 'school' && !university;
  const schoolId = university ? university.id : null;
  useEffect(() => {
    if (locked) return undefined;
    let live = true;
    setRows(null);
    setErr('');
    api
      .leaderboard(period, scope === 'school' ? schoolId : null)
      .then(r => live && setRows(r))
      .catch(e => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [period, scope, schoolId, locked]);
  useEffect(() => {
    api.myStats().then(setStats).catch(() => {});
  }, [schoolId]);
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="cm-overlay cm-overlay--top" {...overlay} onClick={onClose}>
      <motion.div className="cm-card cm-card--board" {...pop} onClick={e => e.stopPropagation()}>
        <div className="cm-board-head">
          <h2>Leaderboard</h2>
          <button className="cm-icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cm-seg cm-seg--wide" role="tablist" aria-label="Leaderboard">
          {[
            ['global', 'Global'],
            ['school', university ? 'My university' : '🔒 My university'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={scope === k} className={scope === k ? 'is-on' : ''} onClick={() => setScope(k)}>
              {l}
            </button>
          ))}
        </div>
        {locked ? (
          <UnlockUniversity />
        ) : (
          <>
            {scope === 'school' && <p className="cm-board-scope">{university.name}</p>}
            <div className="cm-seg cm-seg--wide">
              {[
                ['all', 'All time'],
                ['week', 'This week'],
                ['day', 'Today'],
              ].map(([k, l]) => (
                <button key={k} className={period === k ? 'is-on' : ''} onClick={() => setPeriod(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="cm-board">
              {err && <p className="cm-error">{err}</p>}
              {!rows && !err && <div className="cm-spinner" />}
              {rows && rows.length === 0 && <p className="cm-muted">{scope === 'school' ? 'Nobody from your university has a run here yet. Be the first.' : 'No runs yet. Be the first.'}</p>}
              {rows &&
                rows.map(r => (
                  <div key={`${r.rank}-${r.username}`} className={`cm-board-row ${r.is_me ? 'is-me' : ''} ${r.rank <= 3 ? `is-top${r.rank}` : ''}`}>
                    <span className="cm-rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`}</span>
                    <b>{r.username}</b>
                    <i>🍕 {r.best}</i>
                  </div>
                ))}
            </div>
          </>
        )}
        {stats && stats.total_runs > 0 && (
          <div className="cm-records">
            <h3>Your records</h3>
            <div className="cm-statgrid">
              <div>
                <b>🍕 {stats.best}</b>
                <span>best</span>
              </div>
              <div>
                <b>{stats.rank ? `#${stats.rank}` : '–'}</b>
                <span>global rank</span>
              </div>
              {university && (
                <div>
                  <b>{stats.school_rank ? `#${stats.school_rank}` : '–'}</b>
                  <span>at your school</span>
                </div>
              )}
              <div>
                <b>{stats.total_runs}</b>
                <span>runs</span>
              </div>
              <div>
                <b>{Math.round(stats.longest)} m</b>
                <span>longest</span>
              </div>
              <div>
                <b>{stats.total_takedowns}</b>
                <span>takedowns</span>
              </div>
              <div>
                <b>{stats.total_pizza}</b>
                <span>lifetime 🍕</span>
              </div>
              <div>
                <b>{stats.top_cause || '–'}</b>
                <span>usual demise</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// Shown on the university tab until the player picks one.
function UnlockUniversity() {
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
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
    <div className="cm-unlock">
      <p>Choose your university to unlock its leaderboard.</p>
      <UniversityPicker value={pick} onPick={setPick} />
      {pick && <small className="cm-fine cm-left">{place(pick)}</small>}
      {err && <p className="cm-error">{err}</p>}
      <button className="cm-btn cm-btn--primary cm-btn--small" disabled={!pick || busy} onClick={save}>
        {busy ? 'Saving…' : 'Unlock leaderboard'}
      </button>
    </div>
  );
}
