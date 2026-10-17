import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as THREE from 'three';
import { useGame } from '../game/core/store';
import { runtime, toWorld } from '../game/core/runtime';
import { lessonPrompt } from '../game/core/tutorial';
import { endTutorial, startTutorial, usesTilt } from './flow';

const pop = { initial: { opacity: 0, y: -14, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 24 } }, exit: { opacity: 0, y: -8, transition: { duration: 0.15 } } };

export default function Tutorial() {
  const tut = useGame(s => s.tutorial);
  const touch = useGame(s => s.touch);
  const steerMode = useGame(s => s.steerMode);
  const named = useGame(s => !!s.profile);
  useEffect(() => {
    if (!tut || tut.status !== 'done') return undefined;
    const k = e => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        endTutorial('run');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tut && tut.status]);
  if (!tut) return null;
  const tilt = touch && steerMode === 'tilt' && usesTilt();
  const prompt = tut.lesson ? lessonPrompt(tut.lesson, { touch, tilt }) : null;
  const showStep = tut.status !== 'done';
  return (
    <div className="cm-tut">
      {showStep && (
        <div className="cm-tut-bar">
          <span>
            Tutorial · {Math.min(tut.step + 1, tut.total)}/{tut.total}
          </span>
          <button className="cm-link" onClick={() => endTutorial('menu')}>
            Skip
          </button>
        </div>
      )}
      <AnimatePresence mode="wait">
        {tut.status === 'intro' && (
          <motion.div key="intro" className="cm-tut-toast" {...pop}>
            Let’s learn the controls.
          </motion.div>
        )}
        {tut.status === 'hold' && prompt && (
          <motion.div
            key={`hold-${tut.lesson}-${tut.missed}`}
            className={`cm-tut-card ${touch && tut.lesson === 'throw' ? 'is-bottom' : ''}`}
            {...pop}
            role="status"
            aria-live="polite"
          >
            <div className="cm-tut-dots" aria-hidden="true">
              {Array.from({ length: tut.total }, (_, i) => (
                <i key={i} className={i < tut.step ? 'is-done' : i === tut.step ? 'is-on' : ''} />
              ))}
            </div>
            <h2>{prompt.title}</h2>
            <p>{tut.missed ? (touch ? 'Missed. Tap right on the rider.' : 'Missed. Press Space again.') : prompt.text}</p>
            {prompt.keys && (
              <div className="cm-tut-keys">
                {prompt.keys.map(k => (
                  <kbd key={k} className={k === 'Space' ? 'is-wide' : ''}>
                    {k}
                  </kbd>
                ))}
              </div>
            )}
            {prompt.gesture && <Gesture kind={prompt.gesture} />}
          </motion.div>
        )}
        {tut.status === 'nice' && (
          <motion.div key="nice" className="cm-tut-toast is-good" {...pop}>
            Nice!
          </motion.div>
        )}
        {tut.status === 'retry' && (
          <motion.div key="retry" className="cm-tut-toast is-bad" {...pop}>
            Not quite. Let’s try that again.
          </motion.div>
        )}
        {tut.status === 'done' && (
          <motion.div key="done" className="cm-tut-card cm-tut-card--done" {...pop}>
            <h2>You’ve got it!</h2>
            <p>{named ? 'Dodge the scooters, grab the pizza, and see how far you can get.' : 'Next, pick a username and start your first run.'}</p>
            <p className="cm-tut-tip">{touch ? 'Tip: swipe up again in the air to double jump.' : 'Tip: press ↑ again in the air to double jump.'}</p>
            <button className="cm-btn cm-btn--start" onClick={() => endTutorial('run')} autoFocus>
              <span className="cm-start-pulse" />
              {named ? (touch ? 'START A RUN' : 'START A RUN (ENTER)') : touch ? 'CONTINUE' : 'CONTINUE (ENTER)'}
            </button>
            <button className="cm-link" onClick={() => startTutorial()}>
              Practice again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {tut.status === 'hold' && tut.lesson === 'throw' && <RiderTarget />}
    </div>
  );
}

function Gesture({ kind }) {
  return (
    <div className={`cm-gesture cm-gesture--${kind}`} aria-hidden="true">
      {kind === 'tilt' ? <span className="cm-gesture-phone" /> : kind === 'tap' ? <span className="cm-gesture-tap" /> : <span className="cm-gesture-finger" />}
    </div>
  );
}

// A pulsing ring over the frozen rider: where to tap (or what Space hits).
const _v = new THREE.Vector3();
const _p = {};
function RiderTarget() {
  const [pos, setPos] = useState(null);
  const raf = useRef(0);
  useEffect(() => {
    const loop = () => {
      const w = runtime.world;
      const cam = runtime.camera;
      const t = runtime.tutorial;
      const rd = w && t && t.lesson && w.riders.find(r => r.id === t.lesson.riderId);
      if (rd && cam) {
        toWorld(rd.s, rd.d, (rd.y ?? 0) + 1.1, _p);
        _v.set(_p.x, _p.y, _p.z).project(cam);
        if (_v.z < 1) setPos({ x: ((_v.x + 1) / 2) * window.innerWidth, y: ((1 - _v.y) / 2) * window.innerHeight });
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf.current);
  }, []);
  if (!pos) return null;
  return <div className="cm-tut-target" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} />;
}
