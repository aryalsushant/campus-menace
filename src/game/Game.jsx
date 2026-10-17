import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, tick, fastForward, startWorld } from './core/runtime';
import { createBot } from './sim/bot';
import { useGame, getGame, setGame } from './core/store';
import { TIERS, tierDown, tierUp } from './core/quality';
import Atmosphere from './render/Atmosphere';
import Segments, { chunkMaterials } from './render/Segments';
import Student from './render/Student';
import Riders from './render/Riders';
import { Obstacles, VendingMachines, Pickups, Cans, AimLine, BestMarker, obstacleMaterials } from './render/Entities';
import Particles from './render/Particles';
import CameraRig from './render/CameraRig';
import Effects from './render/Effects';
import { Grass, Leaves, Fireflies } from './render/Nature';
import SkyLife from './render/SkyLife';
import Bystanders from './render/Bystanders';
import PerfMeter from './render/PerfMeter';
import { loadTextures, materials as materials_ } from './render/materials';

function Driver() {
  useFrame((_, dt) => tick(dt), -50);
  return null;
}

// Compile every shader before the first run. Plain compile() only sees
// visible objects, and shadow-depth variants only compile when the shadow
// map draws them, so things that first appear mid-run (an obstacle type, a
// shadow caster coming into range) used to stall a frame for 50-200 ms. For
// one off-screen frame everything is made visible and unculled.
function Warmup() {
  const { gl, scene, camera } = useThree();
  const texReady = useGame(s => s.texReady);
  const tier = useGame(s => s.tier);
  const chunks = useGame(s => s.chunkVersion > 0);
  useEffect(() => {
    let live = true;
    const id = setTimeout(async () => {
      if (!live || getGame().phase === 'playing') return;
      const materials = new Set([...obstacleMaterials(), ...chunkMaterials(), ...Object.values(materials_())]);
      scene.traverse(o => o.isMesh && !Array.isArray(o.material) && materials.add(o.material));
      // Obstacle shapes are baked into instanced batches the first time each
      // kind shows up, so give every material a plain and an instanced
      // stand-in too (shadow casting, so the depth variants compile).
      const showroom = new THREE.Group();
      const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      // plus the plain variants that small props create on the fly
      const generic = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ vertexColors: true }), new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ flatShading: true }), new THREE.MeshStandardMaterial({ vertexColors: true })];
      for (const m of [...materials, ...generic]) {
        if (!m || !m.isMaterial || m.isShaderMaterial) continue;
        const b = new THREE.InstancedMesh(box, m, 1);
        const pair = m.userData.instancedOnly ? [b] : [new THREE.Mesh(box, m), b];
        for (const x of pair) {
          x.castShadow = x.receiveShadow = true;
          showroom.add(x);
        }
      }
      // walkers are skinned: their shadow pass needs its own depth shader
      const bone = new THREE.Bone();
      const skinGeo = box.clone();
      const n = skinGeo.attributes.position.count;
      skinGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
      skinGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
      const skinned = new THREE.SkinnedMesh(skinGeo, new THREE.MeshStandardMaterial());
      skinned.add(bone);
      skinned.bind(new THREE.Skeleton([bone]));
      skinned.castShadow = true;
      showroom.add(skinned);
      showroom.traverse(x => (x.frustumCulled = false));
      showroom.position.copy(camera.position);
      // Compile for the target the scene really draws into: the
      // post-processing buffer (linear, no tone mapping) on medium and high,
      // the screen itself on low. Shaders differ between the two.
      const toScreen = tier === 'low';
      const rt = new THREE.WebGLRenderTarget(64, 64);
      rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      // everything shown and unculled, only for the synchronous calls below,
      // so nothing hidden ever reaches the screen
      const exposed = fn => {
        const touched = [];
        scene.add(showroom);
        scene.traverse(o => {
          if (!o.visible || o.frustumCulled) touched.push([o, o.visible, o.frustumCulled]);
          o.visible = true;
          o.frustumCulled = false;
        });
        const prev = gl.getRenderTarget();
        try {
          gl.setRenderTarget(toScreen ? null : rt);
          return fn();
        } finally {
          gl.setRenderTarget(prev);
          for (const [o, v, f] of touched) (o.visible = v), (o.frustumCulled = f);
          scene.remove(showroom);
        }
      };
      try {
        const compiling = exposed(() => gl.compileAsync && gl.compileAsync(scene, camera));
        if (compiling) await compiling;
        // (low has no shadows, and drawing to the screen would show the stand-ins)
        if (live && !toScreen && getGame().phase !== 'playing') {
          // one real frame for what compile() skips: shadow-depth variants
          gl.shadowMap.needsUpdate = true;
          scene.traverse(o => o.isLight && o.shadow && (o.shadow.needsUpdate = true));
          exposed(() => gl.render(scene, camera));
        }
      } catch {
        // a failed warm-up only means a possible hitch later
      } finally {
        for (const x of showroom.children) x.isInstancedMesh && x.dispose();
        box.dispose();
        skinGeo.dispose();
        skinned.material.dispose();
        generic.forEach(m => m.dispose());
        rt.dispose();
      }
    }, 1200);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [gl, scene, camera, texReady, tier, chunks]);
  return null;
}

// obstacles and props use the compressed textures, so they mount once those
// are on the GPU (loading starts with the canvas, during the landing)
function Textured({ children }) {
  return useGame(s => s.texReady) ? children : null;
}

export default function Game() {
  const tier = useGame(s => s.tier);
  const quality = useGame(s => s.quality);
  const playing = useGame(s => s.phase === 'playing');
  useEffect(() => {
    if (quality !== 'auto') setGame({ tier: quality });
  }, [quality]);
  const T = TIERS[tier];
  // Render scale: set once per tier. The performance monitor may suggest a
  // lower (or higher) scale or tier, but changes wait until no run is in
  // progress, since each one reallocates buffers or recompiles shaders.
  const cap = () => Math.min(TIERS[getGame().tier].dpr[1], window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(cap);
  const pending = useRef({ dpr: null, tier: null });
  useEffect(() => {
    pending.current.dpr = null;
    setDpr(cap());
  }, [tier]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (playing) return;
    const p = pending.current;
    if (p.tier && p.tier !== getGame().tier && getGame().quality === 'auto') setGame({ tier: p.tier });
    else if (p.dpr) setDpr(p.dpr);
    p.tier = p.dpr = null;
  }, [playing]);

  return (
    <Canvas
      className="cm-canvas"
      dpr={dpr}
      shadows={T.shadows ? 'percentage' : false}
      camera={{ fov: 62, near: 0.1, far: 700, position: [0, 4, 8] }}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        loadTextures(gl).then(() => setGame({ texReady: true }));
        if (import.meta.env.DEV) window.__cm = { runtime, gl, scene, getGame, setGame, fastForward, startWorld, botPlay: () => { const b = createBot(); runtime.input = () => b.think(runtime.world); } };
      }}
    >
      <PerformanceMonitor
        onDecline={() => (pending.current.tier = tierDown(getGame().tier))}
        onIncline={() => (pending.current.tier = tierUp(getGame().tier))}
        onChange={({ factor }) => {
          const [lo, hi] = TIERS[getGame().tier].dpr;
          const top = Math.min(hi, window.devicePixelRatio || 1);
          const next = Math.round((Math.min(lo, top) + (top - Math.min(lo, top)) * factor) * 4) / 4;
          if (getGame().phase === 'playing') pending.current.dpr = next;
          else setDpr(next);
        }}
        flipflops={2}
      />
      <PerfMeter />
      <Driver />
      <Warmup />
      <Atmosphere shadows={T.shadows} shadowSize={T.shadowSize} />
      <Segments />
      <Textured>
        <Obstacles />
        <VendingMachines />
        <Pickups />
        <Cans />
      </Textured>
      <AimLine />
      <BestMarker />
      <Riders />
      <Student />
      <Particles />
      {T.grass > 0 && <Grass count={T.grass} />}
      <Leaves count={tier === 'low' ? 40 : 90} />
      <Fireflies />
      <SkyLife tier={tier} />
      <Bystanders count={tier === 'low' ? 4 : 7} />
      <CameraRig />
      <Effects tier={tier} />
    </Canvas>
  );
}
