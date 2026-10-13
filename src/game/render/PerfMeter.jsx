import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

// Frame-rate meter: press ` (backtick) or open the game with ?perf.
// Shows FPS, frame time (avg / worst), draw calls, triangles and the
// current render resolution scale.
export default function PerfMeter() {
  const { gl } = useThree();
  const [on, setOn] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf'));
  const el = useRef();
  const acc = useRef({ frames: 0, t: 0, worst: 0, last: performance.now() });
  useEffect(() => {
    const k = e => e.code === 'Backquote' && setOn(v => !v);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useFrame(() => {
    if (!on || !el.current) return;
    const A = acc.current;
    const now = performance.now();
    const ms = now - A.last;
    A.last = now;
    A.frames++;
    A.t += ms;
    A.worst = Math.max(A.worst, ms);
    if (A.t >= 500) {
      const info = gl.info.render;
      el.current.textContent = `${Math.round((A.frames * 1000) / A.t)} fps · ${(A.t / A.frames).toFixed(1)} ms (worst ${A.worst.toFixed(0)}) · ${info.calls} calls · ${Math.round(info.triangles / 1000)}k tris · dpr ${gl.getPixelRatio().toFixed(2)}`;
      A.frames = 0;
      A.t = 0;
      A.worst = 0;
    }
  });
  if (!on) return null;
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }} zIndexRange={[50, 50]}>
      <div ref={el} style={{ position: 'absolute', left: 8, bottom: 8, padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#7dffb0', font: '600 12px ui-monospace, monospace' }}>
        measuring…
      </div>
    </Html>
  );
}
