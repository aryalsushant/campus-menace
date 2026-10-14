import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import Game from './game/Game.jsx';
import { startWorld } from './game/core/runtime';
import { useGame, getGame, setGame, setPersisted } from './game/core/store';
import { attachKeyboard, attachTouch } from './game/input/controls';
import { wireAudio } from './game/audio/wire';
import { setMuted } from './game/audio/sound';
import { api, authLink, clearAuthLink } from './lib/api';
import { startRun, togglePause, wireFlow, prepareNextRun } from './ui/flow';
import Landing from './ui/Landing.jsx';
import Hud from './ui/Hud.jsx';
import { PauseMenu, GameOver } from './ui/Menus.jsx';

export default function App() {
  useState(() => startWorld('attract'));
  const phase = useGame(s => s.phase);
  const paused = useGame(s => s.paused);
  const muted = useGame(s => s.muted);
  const root = useRef();

  // auth: session → profile → ready
  useEffect(() => {
    let live = true;
    if (authLink.error) setGame({ authNotice: { kind: 'bad', text: authLink.error } });
    else if (authLink.type === 'signup') setGame({ authNotice: { kind: 'good', text: 'Email verified. You’re in!' } });
    if (authLink.type === 'recovery') setGame({ recovering: true });
    const load = async session => {
      if (!live) return;
      if (!session) {
        setGame({ session: null, profile: null, authReady: true });
        return;
      }
      setGame({ session });
      try {
        const profile = await api.profile();
        if (live) setGame({ profile, authReady: true });
      } catch {
        if (live) setGame({ profile: null, authReady: true });
      }
    };
    api.session().then(s => {
      clearAuthLink();
      load(s);
    });
    const off = api.onAuth((s, event) => {
      if (event === 'PASSWORD_RECOVERY') setGame({ recovering: true });
      if (event === 'SIGNED_OUT') setGame({ recovering: false });
      if ((s && s.user && s.user.id) !== (getGame().session && getGame().session.user && getGame().session.user.id)) load(s);
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const set = () => setGame({ touch: coarse.matches });
    set();
    coarse.addEventListener('change', set);
    return () => coarse.removeEventListener('change', set);
  }, []);

  useEffect(() => wireAudio(), []);
  useEffect(() => wireFlow(), []);
  // prebuild the first run's world while the landing screen shows
  useEffect(() => {
    const id = setTimeout(prepareNextRun, 1200);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => setMuted(muted), [muted]);
  useEffect(
    () =>
      attachKeyboard(action => {
        const g = getGame();
        if (action === 'pause') togglePause();
        else if (action === 'mute') setPersisted({ muted: !g.muted });
        else if (action === 'start' && (g.phase === 'over' || (g.phase === 'landing' && g.profile && !document.querySelector('.cm-card--board')))) startRun();
      }),
    []
  );
  useEffect(() => attachTouch(root.current), []);

  // pause when the tab is hidden
  useEffect(() => {
    const vis = () => document.hidden && getGame().phase === 'playing' && !getGame().paused && togglePause();
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  return (
    <div className={`cm-root phase-${phase}`} ref={root}>
      <Game />
      {phase === 'landing' && <div className="cm-scrim" />}
      {phase === 'landing' && <Landing />}
      {(phase === 'playing' || phase === 'over') && <Hud />}
      <AnimatePresence>{phase === 'playing' && paused && <PauseMenu key="pause" />}</AnimatePresence>
      <AnimatePresence>{phase === 'over' && <GameOver key="over" />}</AnimatePresence>
      <button className="cm-mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setPersisted({ muted: !muted })}>
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
