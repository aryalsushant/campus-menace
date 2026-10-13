import { useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, tick, fastForward, startWorld } from './core/runtime';
import { createBot } from './sim/bot';
import { useGame, getGame, setGame } from './core/store';
import { TIERS, guessTier, tierDown, tierUp } from './core/quality';
import Atmosphere from './render/Atmosphere';
import Segments from './render/Segments';
import Student from './render/Student';
import Riders from './render/Riders';
import { Obstacles, VendingMachines, Pickups, Cans, AimLine, BestMarker } from './render/Entities';
import Particles from './render/Particles';
import CameraRig from './render/CameraRig';
import Effects from './render/Effects';
import { Grass, Leaves, Fireflies } from './render/Nature';
import SkyLife from './render/SkyLife';
import Bystanders from './render/Bystanders';
import PerfMeter from './render/PerfMeter';

function Driver() {
  useFrame((_, dt) => tick(dt), -50);
  return null;
}

// compile every shader up front (during the landing screen) so the first
// time a material appears mid-run doesn't stutter
function Warmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const id = setTimeout(() => {
      if (gl.compileAsync) gl.compileAsync(scene, camera).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [gl, scene, camera]);
  return null;
}

export default function Game() {
  const tier = useGame(s => s.tier);
  const quality = useGame(s => s.quality);
  useEffect(() => {
    if (quality === 'auto') setGame({ tier: guessTier() });
    else setGame({ tier: quality });
  }, [quality]);
  const T = TIERS[tier];
  // dynamic resolution: start near the top of the tier's range and let the
  // performance monitor nudge it down or up with the measured frame rate
  const [dpr, setDpr] = useState(() => Math.min(T.dpr[1], window.devicePixelRatio || 1));
  useEffect(() => setDpr(Math.min(T.dpr[1], window.devicePixelRatio || 1)), [tier]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Canvas
      className="cm-canvas"
      dpr={dpr}
      shadows={T.shadows ? 'variance' : false}
      camera={{ fov: 62, near: 0.1, far: 700, position: [0, 4, 8] }}
      gl={{ antialias: tier === 'low', powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        if (import.meta.env.DEV) window.__cm = { runtime, gl, scene, getGame, setGame, fastForward, startWorld, botPlay: () => { const b = createBot(); runtime.input = () => b.think(runtime.world); } };
      }}
    >
      <PerformanceMonitor
        onDecline={() => getGame().quality === 'auto' && setGame({ tier: tierDown(getGame().tier) })}
        onIncline={() => getGame().quality === 'auto' && setGame({ tier: tierUp(getGame().tier) })}
        onChange={({ factor }) => {
          const [lo, hi] = TIERS[getGame().tier].dpr;
          const cap = Math.min(hi, window.devicePixelRatio || 1);
          setDpr(Math.round((lo + (cap - lo) * factor) * 20) / 20);
        }}
        flipflops={3}
      />
      <PerfMeter />
      <Driver />
      <Warmup />
      <Atmosphere shadows={T.shadows} shadowSize={T.shadowSize} />
      <Segments />
      <Obstacles />
      <VendingMachines />
      <Pickups />
      <Cans />
      <AimLine />
      <BestMarker />
      <Riders />
      <Student />
      <Particles />
      {tier !== 'low' && <Grass key={tier} count={tier === 'high' ? 9000 : 4500} />}
      <Leaves count={tier === 'low' ? 40 : 90} />
      <Fireflies />
      <SkyLife tier={tier} />
      <Bystanders count={tier === 'low' ? 4 : 7} />
      <CameraRig />
      <Effects tier={tier} />
    </Canvas>
  );
}
