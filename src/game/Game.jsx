import { useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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

function Driver() {
  useFrame((_, dt) => tick(dt), -50);
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

  return (
    <Canvas
      className="cm-canvas"
      dpr={T.dpr}
      shadows={T.shadows ? 'variance' : false}
      camera={{ fov: 62, near: 0.1, far: 900, position: [0, 4, 8] }}
      gl={{ antialias: tier === 'low', powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        if (import.meta.env.DEV) window.__cm = { runtime, gl, getGame, setGame, fastForward, startWorld, botPlay: () => { const b = createBot(); runtime.input = () => b.think(runtime.world); } };
      }}
    >
      <PerformanceMonitor
        onDecline={() => getGame().quality === 'auto' && setGame({ tier: tierDown(getGame().tier) })}
        onIncline={() => getGame().quality === 'auto' && setGame({ tier: tierUp(getGame().tier) })}
        flipflops={3}
      />
      <Driver />
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
      {tier !== 'low' && <Grass key={tier} count={tier === 'high' ? 14000 : 6000} />}
      <Leaves count={tier === 'low' ? 40 : 90} />
      <Fireflies />
      <SkyLife tier={tier} />
      <CameraRig />
      <Effects tier={tier} />
    </Canvas>
  );
}
