import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../game/core/store';
import { on } from '../game/core/bus';
import { runtime } from '../game/core/runtime';
import { CANS, STAGES } from '../game/sim/tune';
import { togglePause } from './flow';
import { Controls } from './Landing';

const POWER_LABEL = { magnet: '🧲 Magnet', coffee: '☕ Cold brew', sixpack: '🥫 Six-pack' };

export default function Hud() {
  const score = useGame(s => s.score);
  const cans = useGame(s => s.cans);
  const combo = useGame(s => s.combo);
  const power = useGame(s => s.power);
  const shaken = useGame(s => s.shaken);
  const touch = useGame(s => s.touch);
  const runCount = useGame(s => s.runCount);
  const inTutorial = useGame(s => !!s.tutorial);
  const [bump, setBump] = useState(0);
  const distRef = useRef();
  useEffect(() => {
    runtime.distEl = distRef.current;
    runtime.distShown = -1;
    return () => {
      if (runtime.distEl === distRef.current) runtime.distEl = null;
    };
  }, []);
  useEffect(() => on('pizza', () => setBump(b => b + 1)), []);
  const unlimited = power.sixpack > 0;

  return (
    <div className="cm-hud">
      <div className={`cm-shaken ${shaken ? 'is-on' : ''}`} />
      <SpeedLines />
      <div className="cm-hud-top">
        <div className="cm-hud-left">
          <button className="cm-icon-btn" aria-label="Pause" onClick={togglePause}>
            ❚❚
          </button>
          <span className="cm-distance" ref={distRef} />
        </div>
        <div className="cm-score-wrap">
          <motion.div key={bump} className="cm-score" initial={{ scale: 1.18 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
            <span className="cm-slice">🍕</span>
            {score}
          </motion.div>
          <AnimatePresence>
            {combo >= 2 && (
              <motion.div key="combo" className="cm-combo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                COMBO ×{combo}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="cm-hud-right">
          <div className={`cm-cans ${cans === 0 && !unlimited ? 'is-empty' : cans === 1 && !unlimited ? 'is-low' : ''}`}>
            <span className="cm-can-icon" />
            <b>{unlimited ? '∞' : cans}</b>
            <div className="cm-can-pips">
              {Array.from({ length: CANS.max }, (_, i) => (
                <i key={i} className={unlimited || i < cans ? 'on' : ''} />
              ))}
            </div>
          </div>
          <div className="cm-powers">
            {power.hoodie && <span className="cm-power">🧥 Shield</span>}
            {Object.entries(POWER_LABEL).map(([k, label]) =>
              power[k] > 0 ? (
                <span key={k} className="cm-power">
                  {label} <small>{Math.ceil(power[k])}s</small>
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>
      <Callouts />
      {runCount <= 2 && !inTutorial && <ControlsHint touch={touch} />}
    </div>
  );
}

function ControlsHint({ touch }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="cm-hint-bar" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
          <Controls touch={touch} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// big punchy text for the moments that matter
let calloutId = 0;
function Callouts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const push = (text, cls = '', sub = '') => {
      const id = ++calloutId;
      setItems(list => [...list.slice(-3), { id, text, cls, sub }]);
      setTimeout(() => setItems(list => list.filter(i => i.id !== id)), 1100);
    };
    const live = fn => e => runtime.mode === 'play' && fn(e);
    const offs = [
      on('closeCall', live(() => push('CLOSE CALL!', 'is-close', '+1 🍕'))),
      on('takedown', live(e => push(e.how === 'can' ? 'TAKEDOWN!' : 'BOWLED OVER!', 'is-takedown', '+3 🍕'))),
      on('comboBonus', live(e => push(`COMBO ×${e.combo}`, 'is-combo', `+${e.bonus} 🍕`))),
      on('restock', live(e => e.added > 0 && push('RESTOCKED', 'is-restock', `🥫 ${e.cans}`))),
      on('noCans', live(() => push('OUT OF CANS', 'is-warn', 'find a vending machine'))),
      on('stumble', live(e => push('OOF!', 'is-warn', e.dropped ? `dropped ${e.dropped} 🍕` : 'careful…'))),
      on('shieldBreak', live(() => push('SHIELD SAVED YOU', 'is-power'))),
      on('powerup', live(e => push({ magnet: 'PIZZA MAGNET', coffee: 'COLD BREW', hoodie: 'HOODIE SHIELD', sixpack: 'SIX-PACK' }[e.kind], 'is-power'))),
      on('stage', live(e => push(STAGES[e.stage].name.toUpperCase(), 'is-stage'))),
      on('golden', live(() => push('GOLDEN SLICE', 'is-combo', '+5 🍕'))),
      on('passedBest', live(() => push('NEW RECORD!', 'is-stage', 'keep going…'))),
    ];
    return () => offs.forEach(f => f());
  }, []);
  return (
    <div className="cm-callouts">
      <AnimatePresence>
        {items.map(i => (
          <motion.div key={i.id} className={`cm-callout ${i.cls}`} initial={{ opacity: 0, scale: 0.5, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: -24, scale: 1.05 }} transition={{ type: 'spring', stiffness: 420, damping: 20 }}>
            {i.text}
            {i.sub && <small>{i.sub}</small>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// speed lines strengthen with speed; cheap CSS overlay
function SpeedLines() {
  const ref = useRef();
  useEffect(() => {
    let raf;
    const loop = () => {
      const w = runtime.world;
      if (w && ref.current) {
        const v = w.runner.speed;
        const k = Math.max(0, Math.min(1, (v - 15) / 10)) + (w.power.coffee > 0 ? 0.4 : 0);
        ref.current.style.opacity = String(Math.min(0.75, k * 0.6));
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="cm-speedlines" />;
}
