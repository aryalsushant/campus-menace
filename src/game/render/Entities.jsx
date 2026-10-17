import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, runnerLerp, lerpEntity, toWorld } from '../core/runtime';
import { emit } from '../core/bus';
import { useGame } from '../core/store';
import { withRim, pbr } from './materials';
import { mergeStatic } from './geo';
import { useOriginShift } from './origin';
import { loadPeople, makePerson, randomLook } from './people';
import { canAssets, pizzaGeometry } from './props';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, ...o });
const glow = (c, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

let M = null;
// every obstacle material, for the shader warm-up before the first run
export const obstacleMaterials = () => Object.values(mats()).flat();

function mats() {
  if (M) return M;
  M = {
    yellow: std('#ffd23f'),
    planks: pbr('planks', { scale: 1 / 0.9, vertexColors: false }),
    brick: pbr('brick', { scale: 1 / 1.25, normal: 1.3, vertexColors: false }),
    stone: pbr('sandstone', { scale: 1 / 1.6, vertexColors: false }),
    flower2: std('#ffffff'),
    screen: glow('#7fd4ff', 1.6),
    blueGlow: glow('#3d8fe8', 1.8),
    recycle: signMaterial(['♻ RECYCLE', 'CANS · BOTTLES', 'PAPER'], '#1f6f4a', '#ffffff'),
    wayfinding: signMaterial(['← LIBRARY', '→ STUDENT UNION', '↑ STADIUM'], '#1d1d20', '#f4e3a8'),
    black: std('#1d1d22'),
    white: std('#f4f6f8', { flatShading: false, roughness: 0.35 }),
    orange: std('#ff7a2a'),
    red: std('#e8473f'),
    blue: std('#3d6fe0'),
    green: std('#3f8f4a'),
    wood: std('#a0683e'),
    metal: std('#9aa3ad', { metalness: 0.6, roughness: 0.35 }),
    dark: std('#2d3a3a'),
    concrete: std('#c9c4b8'),
    hedge: std('#3f7f3a'),
    flower: std('#ff6fa5'),
    goose: std('#f2efe6'),
    gooseBody: withRim(std('#7a6a58', { flatShading: false, roughness: 0.85 }), '#ffe6c8', 0.35),
    gooseBreast: std('#d9cbb4', { flatShading: false, roughness: 0.85 }),
    gooseWing: std('#5f5246', { flatShading: false, roughness: 0.85 }),
    gooseNeck: std('#1c1c1e', { flatShading: false, roughness: 0.6 }),
    beak: std('#ff9a2a'),
    skin: std('#e9b48f'),
    banner: ['#ffb02e', '#3f8fe8', '#8f5fe8', '#e8476a'].map(c => std(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.35 })),
    shirts: ['#3fb4e8', '#8f5fe8', '#e8476a', '#2fbf8f', '#f2c63a', '#ff8a3d'].map(c => std(c)),
    pants: std('#2b3242'),
    lampGlow: glow('#ffd9a0', 1.8),
    robotEye: glow('#3dffb0', 2),
    robotLid: std('#e6e9ee', { flatShading: false, roughness: 0.4 }),
    robotFlag: std('#ff6a1a', { emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 0.6 }),
    flag: glow('#ff3b30', 1.6),
  };
  return M;
}

// ------------------------------------------------------------------ models
function ObstacleModel({ o }) {
  const m = mats();
  const w2 = o.hw * 2;
  switch (o.model) {
    case 'wetfloor': {
      // a row of signs joined by caution tape, covering the whole hitbox
      const n = Math.max(2, Math.round(w2 / 0.75));
      const xs = Array.from({ length: n }, (_, i) => -w2 / 2 + 0.3 + (i * (w2 - 0.6)) / Math.max(1, n - 1));
      return (
        <group>
          {xs.map(x => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 0.46, 0.11]} rotation={[-0.24, 0, 0]} material={m.yellow} castShadow>
                <boxGeometry args={[0.62, 0.95, 0.04]} />
              </mesh>
              <mesh position={[0, 0.46, -0.11]} rotation={[0.24, 0, 0]} material={m.yellow} castShadow>
                <boxGeometry args={[0.62, 0.95, 0.04]} />
              </mesh>
              <mesh position={[0, 0.55, -0.22]} rotation={[0.24, 0, 0]} material={m.black}>
                <boxGeometry args={[0.26, 0.26, 0.01]} />
              </mesh>
            </group>
          ))}
          {[0, 1, 2, 3, 4, 5].map(i => (
            <mesh key={i} position={[-w2 / 2 + ((i + 0.5) * w2) / 6, 0.7, 0]} material={i % 2 ? m.black : m.yellow}>
              <boxGeometry args={[w2 / 6, 0.09, 0.02]} />
            </mesh>
          ))}
        </group>
      );
    }
    case 'backpacks':
      return (
        <group>
          {[
            [-0.35, 0.22, 0, m.red],
            [0.3, 0.22, 0.1, m.blue],
            [0, 0.55, 0, m.shirts[4]],
            [0.6, 0.2, -0.1, m.green],
          ].map(([x, y, z, mm], i) => (
            <RoundedBox key={i} args={[0.5, 0.42, 0.34]} radius={0.1} position={[x * (w2 / 1.6), y, z]} rotation={[0, i, 0]} material={mm} castShadow />
          ))}
        </group>
      );
    case 'skateboard':
      return (
        <group>
          <RoundedBox args={[0.3, 0.06, 0.85]} radius={0.02} position={[-w2 * 0.25, 0.14, 0]} rotation={[0, 0.6, 0]} material={m.red} castShadow />
          <RoundedBox args={[Math.max(0.5, w2 * 0.45), 0.6, 0.42]} radius={0.12} position={[w2 * 0.2, 0.32, 0.1]} material={m.blue} castShadow />
          <mesh position={[0, 0.7, 0]} material={m.yellow}>
            <boxGeometry args={[w2, 0.08, 0.02]} />
          </mesh>
        </group>
      );
    case 'cone':
      return (
        <group>
          {[-0.4, 0.4].map(x => (
            <mesh key={x} position={[x * (w2 / 1.4), 0.38, 0]} material={m.orange} castShadow>
              <coneGeometry args={[0.25, 0.76, 10]} />
            </mesh>
          ))}
          <mesh position={[0, 0.55, 0]} material={m.white}>
            <boxGeometry args={[w2 * 0.6, 0.08, 0.04]} />
          </mesh>
        </group>
      );
    case 'barrier':
    case 'barrierRow':
      return (
        <group>
          <mesh position={[0, 0.55, 0]} material={m.orange} castShadow>
            <boxGeometry args={[w2, 0.22, 0.1]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} material={m.white} castShadow>
            <boxGeometry args={[w2, 0.16, 0.1]} />
          </mesh>
          {[-1, 1].map(s => (
            <mesh key={s} position={[(s * w2) / 2 - s * 0.1, 0.35, 0]} material={m.dark}>
              <boxGeometry args={[0.08, 0.7, 0.5]} />
            </mesh>
          ))}
        </group>
      );
    case 'crates':
      return o.kind === 'tall' ? (
        <group>
          {[0.45, 1.25, 2.05].map((y, i) => (
            <mesh key={y} position={[0, y, 0]} rotation={[0, i * 0.3, 0]} material={m.planks} castShadow>
              <boxGeometry args={[Math.min(1.1, w2), 0.78, 0.8]} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.38, 0]} material={m.planks} castShadow>
          <boxGeometry args={[w2, 0.76, 0.8]} />
        </mesh>
      );
    case 'hedgeRow':
    case 'planterRow':
      // brick planter with clipped boxwood and blooms
      return (
        <group>
          <mesh position={[0, 0.25, 0]} material={o.model === 'planterRow' ? m.stone : m.brick} castShadow receiveShadow>
            <boxGeometry args={[w2, 0.5, 0.85]} />
          </mesh>
          <mesh position={[0, 0.52, 0]} material={m.stone}>
            <boxGeometry args={[w2 + 0.06, 0.06, 0.92]} />
          </mesh>
          <mesh position={[0, 0.72, 0]} material={m.hedge} castShadow>
            <boxGeometry args={[w2 - 0.12, 0.36, 0.68]} />
          </mesh>
          {Array.from({ length: Math.round(w2 / 0.55) }, (_, i) => (
            <mesh key={i} position={[-w2 / 2 + 0.3 + i * 0.55, 0.92, (i % 2) * 0.16 - 0.08]} material={i % 3 ? m.flower : m.flower2}>
              <icosahedronGeometry args={[0.09, 1]} />
            </mesh>
          ))}
        </group>
      );
    case 'clubBanner':
    case 'beam': {
      const beam = o.model === 'beam';
      return (
        <group>
          {[-1, 1].map(sd => (
            <mesh key={sd} position={[(sd * w2) / 2, 1.5, 0]} material={beam ? m.yellow : m.dark} castShadow>
              <cylinderGeometry args={[0.07, 0.08, 3, 10]} />
            </mesh>
          ))}
          {beam ? (
            <>
              <mesh position={[0, o.clear + 0.5, 0]} material={m.yellow} castShadow>
                <boxGeometry args={[w2, 0.4, 0.4]} />
              </mesh>
              <mesh position={[0, o.clear + 0.5, -0.21]} material={m.black}>
                <boxGeometry args={[w2 * 0.98, 0.12, 0.01]} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, o.clear + 0.5, 0]} material={clubBannerMaterial(o.id)} castShadow>
              <boxGeometry args={[w2, 0.95, 0.04]} />
            </mesh>
          )}
        </group>
      );
    }
    case 'lamp':
      // black acorn lamp post
      return (
        <group>
          <mesh position={[0, 0.25, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.22, 0.28, 0.5, 12]} />
          </mesh>
          <mesh position={[0, 2.1, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.08, 0.11, 3.4, 12]} />
          </mesh>
          <mesh position={[0, 4.25, 0]} material={m.lampGlow}>
            <sphereGeometry args={[0.27, 14, 10]} />
          </mesh>
          <mesh position={[0, 4.62, 0]} material={m.dark}>
            <coneGeometry args={[0.13, 0.26, 12]} />
          </mesh>
        </group>
      );
    case 'bikeRack':
      // bike-share dock: a tall kiosk sign and bikes parked in hoops
      return (
        <group>
          <mesh position={[0, 1.25, 0]} material={m.dark} castShadow>
            <boxGeometry args={[0.5, 2.5, 0.3]} />
          </mesh>
          <mesh position={[0, 1.9, -0.16]} material={m.screen}>
            <boxGeometry args={[0.36, 0.5, 0.01]} />
          </mesh>
          <mesh position={[0, 2.35, 0]} material={m.blueGlow}>
            <boxGeometry args={[0.52, 0.18, 0.32]} />
          </mesh>
          {[-1, 1].map(sd => (
            <Bike key={sd} x={sd * Math.min(0.45, w2 * 0.3)} m={m} />
          ))}
        </group>
      );
    case 'trashcan':
      // recycling station with a tall sign
      return (
        <group>
          {[-0.3, 0.3].map((x, i) => (
            <mesh key={x} position={[x, 0.5, 0]} material={i ? m.blue : m.green} castShadow>
              <cylinderGeometry args={[0.28, 0.25, 1, 14]} />
            </mesh>
          ))}
          <mesh position={[0, 1.6, 0.1]} material={m.dark}>
            <boxGeometry args={[0.08, 2.4, 0.08]} />
          </mesh>
          <mesh position={[0, 2.35, 0.08]} material={m.recycle} castShadow>
            <boxGeometry args={[0.9, 0.5, 0.05]} />
          </mesh>
        </group>
      );
    case 'sign':
      // campus wayfinding sign
      return (
        <group>
          {[-0.45, 0.45].map(x => (
            <mesh key={x} position={[x * Math.min(1, w2 / 1.2), 1.2, 0]} material={m.dark}>
              <boxGeometry args={[0.08, 2.4, 0.08]} />
            </mesh>
          ))}
          <mesh position={[0, 1.8, 0]} material={m.wayfinding} castShadow>
            <boxGeometry args={[Math.min(1.3, w2), 1.1, 0.06]} />
          </mesh>
        </group>
      );
    case 'portapotty':
      return (
        <group>
          <RoundedBox args={[Math.min(1.2, w2), 2.3, 1.1]} radius={0.06} position={[0, 1.15, 0]} material={m.blue} castShadow />
          <mesh position={[0, 2.34, 0]} material={m.white}>
            <boxGeometry args={[Math.min(1.25, w2 + 0.05), 0.1, 1.15]} />
          </mesh>
        </group>
      );
    case 'student':
    case 'tourist':
      return <RiggedPerson o={o} />;
    case 'goose':
      return <Goose o={o} />;
    case 'robot':
      // sidewalk delivery robot: white tub on six wheels, flag on a whip antenna
      return (
        <group>
          <RoundedBox args={[0.6, 0.38, 0.74]} radius={0.1} position={[0, 0.38, 0]} material={m.white} castShadow />
          <RoundedBox args={[0.56, 0.12, 0.7]} radius={0.06} position={[0, 0.6, 0.01]} material={m.robotLid} castShadow />
          <mesh position={[0, 0.555, 0]} material={m.black}>
            <boxGeometry args={[0.61, 0.012, 0.75]} />
          </mesh>
          <RoundedBox args={[0.5, 0.16, 0.04]} radius={0.03} position={[0, 0.42, -0.375]} material={m.black} />
          {[-0.12, 0.12].map(x => (
            <mesh key={x} position={[x, 0.43, -0.4]} rotation={[Math.PI / 2, 0, 0]} material={m.robotEye}>
              <cylinderGeometry args={[0.025, 0.025, 0.01, 10]} />
            </mesh>
          ))}
          <mesh position={[0, 0.3, -0.372]} material={m.lampGlow}>
            <boxGeometry args={[0.4, 0.03, 0.01]} />
          </mesh>
          <mesh position={[0, 0.3, 0.372]} material={m.flag}>
            <boxGeometry args={[0.4, 0.03, 0.01]} />
          </mesh>
          {[-1, 1].map(side =>
            [-0.24, 0, 0.24].map(z => (
              <group key={`${side}${z}`} position={[side * 0.31, 0.11, z]}>
                <mesh rotation={[0, 0, Math.PI / 2]} material={m.black} castShadow>
                  <cylinderGeometry args={[0.11, 0.11, 0.07, 14]} />
                </mesh>
                <mesh position={[side * 0.036, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.metal}>
                  <cylinderGeometry args={[0.05, 0.05, 0.01, 10]} />
                </mesh>
              </group>
            ))
          )}
          <mesh position={[0.2, 1.02, 0.28]} material={m.dark}>
            <cylinderGeometry args={[0.008, 0.012, 0.9, 5]} />
          </mesh>
          <mesh position={[0.29, 1.38, 0.28]} material={m.robotFlag}>
            <boxGeometry args={[0.18, 0.12, 0.01]} />
          </mesh>
          <mesh position={[0.2, 1.48, 0.28]} material={m.flag}>
            <sphereGeometry args={[0.025, 6, 4]} />
          </mesh>
        </group>
      );
    default:
      return (
        <mesh position={[0, o.kind === 'tall' ? 1.2 : 0.4, 0]} material={m.red}>
          <boxGeometry args={[w2, o.kind === 'tall' ? 2.4 : 0.8, o.hd * 2]} />
        </mesh>
      );
  }
}


// Canada goose: grey-brown body, pale breast, black neck and head with a
// white chinstrap. Wings spread and flap and the neck pumps when it chases.
function Goose({ o }) {
  const m = mats();
  const wingL = useRef();
  const wingR = useRef();
  const neck = useRef();
  const legs = useRef();
  const neckCurve = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, -0.06), new THREE.Vector3(0, 0.38, -0.04), new THREE.Vector3(0, 0.5, -0.1)]);
    return new THREE.TubeGeometry(c, 16, 0.045, 8, false);
  }, []);
  useFrame(state => {
    const t = state.clock.elapsedTime + o.id;
    const chase = o.chasing && !o.hit;
    const flap = chase ? Math.sin(t * 16) * 0.6 + 0.7 : 0.05;
    if (wingL.current) wingL.current.rotation.z = flap;
    if (wingR.current) wingR.current.rotation.z = -flap;
    if (neck.current) {
      neck.current.rotation.x = chase ? -0.5 + Math.sin(t * 8) * 0.25 : Math.sin(t * 1.5) * 0.08;
      neck.current.position.z = chase ? -0.14 : -0.16;
    }
    if (legs.current) legs.current.children.forEach((l, i) => (l.rotation.x = Math.sin(t * (chase ? 18 : 6) + i * Math.PI) * (chase ? 0.6 : 0.3)));
  });
  return (
    <group scale={1.15}>
      {/* body and breast */}
      <mesh position={[0, 0.38, 0.04]} scale={[0.72, 0.62, 1.15]} material={m.gooseBody} castShadow>
        <sphereGeometry args={[0.27, 16, 12]} />
      </mesh>
      <mesh position={[0, 0.34, -0.12]} scale={[0.68, 0.6, 0.7]} material={m.gooseBreast} castShadow>
        <sphereGeometry args={[0.24, 14, 10]} />
      </mesh>
      {/* tail */}
      <mesh position={[0, 0.44, 0.34]} rotation={[0.5, 0, 0]} scale={[0.5, 0.25, 0.6]} material={m.gooseNeck}>
        <sphereGeometry args={[0.15, 10, 8]} />
      </mesh>
      <mesh position={[0, 0.3, 0.28]} scale={[0.5, 0.3, 0.4]} material={m.white}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      {/* wings */}
      {[
        [wingL, -1],
        [wingR, 1],
      ].map(([ref, side]) => (
        <group key={side} ref={ref} position={[side * 0.17, 0.48, 0.02]}>
          <mesh position={[side * 0.12, 0, 0.06]} scale={[0.9, 0.18, 1.5]} material={m.gooseWing} castShadow>
            <sphereGeometry args={[0.16, 12, 8]} />
          </mesh>
        </group>
      ))}
      {/* neck, head, chinstrap, beak */}
      <group ref={neck} position={[0, 0.5, -0.16]}>
        <mesh geometry={neckCurve} material={m.gooseNeck} castShadow />
        <group position={[0, 0.52, -0.12]}>
          <mesh scale={[0.75, 0.8, 1.15]} material={m.gooseNeck} castShadow>
            <sphereGeometry args={[0.075, 12, 10]} />
          </mesh>
          {[-1, 1].map(side => (
            <mesh key={side} position={[side * 0.045, -0.02, 0.01]} scale={[0.35, 0.75, 0.9]} material={m.white}>
              <sphereGeometry args={[0.06, 10, 8]} />
            </mesh>
          ))}
          <mesh position={[0, -0.01, -0.1]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.6]} material={m.gooseNeck}>
            <coneGeometry args={[0.032, 0.1, 8]} />
          </mesh>
          {[-1, 1].map(side => (
            <mesh key={side} position={[side * 0.042, 0.02, -0.03]} material={m.black}>
              <sphereGeometry args={[0.012, 6, 6]} />
            </mesh>
          ))}
        </group>
      </group>
      {/* legs */}
      <group ref={legs}>
        {[-0.08, 0.08].map(x => (
          <group key={x} position={[x, 0.22, 0.04]}>
            <mesh position={[0, -0.1, 0]} material={m.gooseNeck}>
              <cylinderGeometry args={[0.015, 0.015, 0.2, 5]} />
            </mesh>
            <mesh position={[0, -0.2, -0.04]} material={m.gooseNeck}>
              <boxGeometry args={[0.08, 0.015, 0.1]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}


// club names on the hanging banners (black and gold)
const CLUBS = ['CHESS CLUB', 'PRE-MED SOCIETY', 'ROBOTICS', 'DANCE TEAM', 'FILM CLUB', 'HOMECOMING', 'GAME NIGHT', 'FREE PIZZA'];
const bannerMats = new Map();
function clubBannerMaterial(id) {
  const k = id % CLUBS.length;
  if (bannerMats.has(k)) return bannerMats.get(k);
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d');
  const gold = k % 2 === 0;
  g.fillStyle = gold ? '#d4a82a' : '#1d1d20';
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = gold ? '#1d1d20' : '#d4a82a';
  g.lineWidth = 10;
  g.strokeRect(10, 10, 1004, 140);
  g.fillStyle = gold ? '#1d1d20' : '#f4e3a8';
  g.font = '900 92px Arial Black, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText(CLUBS[k], 512, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 0.25 });
  bannerMats.set(k, m);
  return m;
}

function signMaterial(lines, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 384);
  g.fillStyle = fg;
  g.font = '800 50px Arial, sans-serif';
  lines.forEach((l, i) => g.fillText(l, 30, 90 + i * 100));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

function Bike({ x, m }) {
  return (
    <group position={[x, 0, 0.1]} rotation={[0, Math.PI / 2, 0]}>
      {[-0.5, 0.5].map(z => (
        <mesh key={z} position={[0, 0.34, z]} rotation={[0, Math.PI / 2, 0]} material={m.black}>
          <torusGeometry args={[0.32, 0.03, 8, 20]} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.blue}>
        <cylinderGeometry args={[0.025, 0.025, 1, 6]} />
      </mesh>
      <mesh position={[0, 0.85, -0.45]} material={m.black}>
        <boxGeometry args={[0.5, 0.04, 0.04]} />
      </mesh>
      <mesh position={[0, 0.75, 0.3]} material={m.black}>
        <boxGeometry args={[0.12, 0.05, 0.22]} />
      </mesh>
    </group>
  );
}

// queue and tour members are rigged people
function RiggedPerson({ o }) {
  const ref = useRef();
  const P = useRef(null);
  useEffect(() => {
    let live = true;
    loadPeople().then(() => {
      if (!live || !ref.current) return;
      const look = randomLook((o.seed || o.id) * 31 + 7);
      const p = makePerson({ ...look, castShadow: true, lod: true });
      p.play(o.model === 'tourist' ? 'Walk_Loop' : 'Idle_Talking_Loop', { timeScale: 0.8 + ((o.seed || 1) % 5) * 0.08 });
      p.mixer.update(((o.seed || 1) % 17) * 0.13);
      ref.current.add(p.root);
      P.current = p;
    });
    return () => {
      live = false;
    };
  }, [o]);
  useFrame((_, dt) => {
    const p = P.current;
    if (!p) return;
    if (o.hit) p.play('Hit_Chest', { loop: false, fade: 0.05 });
    p.tick(Math.min(dt, 0.05), runtime.camera);
  });
  return <group ref={ref} />;
}

const Obstacle = memo(function Obstacle({ o }) {
  const ref = useRef();
  const inner = useRef();
  const w = useMemo(() => ({}), []);
  const st = useRef({ hitT: 0 });
  useFrame((state, rawDt) => {
    if (!ref.current) return;
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    const h = toWorld(o.s, o.d, o.y, w);
    ref.current.position.set(w.x, w.y, w.z);
    let yaw = -h;
    if (o.model === 'goose' || o.model === 'tourist') yaw += Math.PI; // face the runner
    if (o.model === 'robot') yaw += o.vd > 0 ? -Math.PI / 2 : Math.PI / 2;
    ref.current.rotation.y = yaw;
    const I = inner.current;
    if (o.hit) {
      st.current.hitT += dt;
      const k = Math.min(1, st.current.hitT / 0.35);
      I.rotation.x = -k * (o.kind === 'tall' ? 1.35 : 0.9);
      I.position.z = -k * 0.8;
      I.position.y = Math.sin(k * Math.PI) * 0.3;
    } else if (o.model === 'goose') {
      I.position.y = Math.abs(Math.sin(state.clock.elapsedTime * (o.chasing ? 14 : 5))) * 0.05;
      I.rotation.z = Math.sin(state.clock.elapsedTime * (o.chasing ? 14 : 4)) * 0.12;
    } else if (o.model === 'tourist' || o.model === 'student') {
      I.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 5 + o.id)) * 0.03;
    }
  }, -15);
  return (
    <group ref={ref}>
      <group ref={inner}>
        <ObstacleModel o={o} />
      </group>
    </group>
  );
});

// Rigged or animated obstacles keep their own component; every other model
// is baked once per shape and drawn through one InstancedMesh per material,
// so a spawn costs nothing and a screen full of obstacles is a few draws.
const DYNAMIC = new Set(['student', 'tourist', 'goose']);
const isStatic = o => !DYNAMIC.has(o.model);
// widths are snapped to 25 cm for baking; the instance is then stretched
// back to the exact hitbox width (at most a couple of percent)
const bakeWidth = o => Math.max(0.25, Math.round(o.hw * 8) / 4);
const bakeKey = o => `${o.model}|${o.kind}|${bakeWidth(o)}|${o.hd}|${o.clear || 0}|${o.model === 'clubBanner' ? o.id % CLUBS.length : 0}`;
const baked = new Map(); // key -> [{ geometry, material, castShadow, receiveShadow }]

function Baker({ k, o, onDone }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const g = ref.current;
    mergeStatic(g);
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const parts = [];
    g.traverse(c => {
      if (!c.isMesh || Array.isArray(c.material)) return;
      const geometry = c.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
      geometry.computeBoundingSphere();
      parts.push({ geometry, material: c.material, castShadow: c.castShadow, receiveShadow: c.receiveShadow });
    });
    baked.set(k, parts);
    onDone();
    // bake once per mount; the key fully describes the shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <group ref={ref}>
      <ObstacleModel o={{ ...o, hw: bakeWidth(o) / 2 }} />
    </group>
  );
}

const _outer = new THREE.Matrix4();
const _inner = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _scale = new THREE.Matrix4();
const _m4 = new THREE.Matrix4();

function ObstacleBatch() {
  useGame(s => s.objVersion);
  const [, setBakes] = useState(0);
  const onDone = useCallback(() => setBakes(n => n + 1), []);
  const group = useRef();
  const batches = useRef(new Map()); // key -> { meshes, cap }
  const hitT = useRef(new WeakMap());
  const w = useMemo(() => ({}), []);

  // grow (or create) the instanced meshes for a baked shape
  const batchFor = (k, need) => {
    let b = batches.current.get(k);
    if (b && b.cap >= need) return b;
    const cap = Math.max(8, (b ? b.cap : 4) * 2, need);
    if (b) for (const m of b.meshes) {
      group.current.remove(m);
      m.dispose();
    }
    const meshes = baked.get(k).map(p => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, cap);
      m.castShadow = p.castShadow;
      m.receiveShadow = p.receiveShadow;
      m.frustumCulled = false;
      m.count = 0;
      group.current.add(m);
      return m;
    });
    b = { meshes, cap, n: 0 };
    batches.current.set(k, b);
    return b;
  };

  useFrame((_, rawDt) => {
    const world = runtime.world;
    if (!world || !group.current) return;
    const B = batches.current;
    for (const b of B.values()) b.n = 0;
    const r = world.runner;
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    for (const o of world.obstacles) {
      if (!isStatic(o) || o.s < r.s - 10 || o.s > r.s + 340) continue;
      const k = bakeKey(o);
      if (!baked.has(k)) continue;
      const b = B.get(k);
      const n = b ? b.n : 0;
      const batch = batchFor(k, n + 1);
      // place: path frame, then the knocked-over tilt, then the width stretch
      const h = toWorld(o.s, o.d, o.y, w);
      let yaw = -h;
      if (o.model === 'robot') yaw += o.vd > 0 ? -Math.PI / 2 : Math.PI / 2;
      _outer.makeRotationY(yaw).setPosition(w.x, w.y, w.z);
      if (o.hit) {
        const t = (hitT.current.get(o) || 0) + dt;
        hitT.current.set(o, t);
        const q = Math.min(1, t / 0.35);
        _rot.makeRotationX(-q * (o.kind === 'tall' ? 1.35 : 0.9));
        _inner.makeTranslation(0, Math.sin(q * Math.PI) * 0.3, -q * 0.8).multiply(_rot);
        _outer.multiply(_inner);
      }
      _scale.makeScale((o.hw * 2) / bakeWidth(o), 1, 1);
      _m4.multiplyMatrices(_outer, _scale);
      for (const m of batch.meshes) m.setMatrixAt(n, _m4);
      batch.n = n + 1;
    }
    for (const b of B.values())
      for (const m of b.meshes) {
        if (m.count !== b.n) m.count = b.n;
        if (b.n) m.instanceMatrix.needsUpdate = true;
      }
  }, -15);

  // shapes that still need baking (each once, ever)
  const pending = new Map();
  if (runtime.world) for (const o of runtime.world.obstacles) if (isStatic(o)) {
    const k = bakeKey(o);
    if (!baked.has(k) && !pending.has(k)) pending.set(k, o);
  }
  return (
    <>
      <group ref={group} />
      <group visible={false}>
        {[...pending].map(([k, o]) => (
          <Baker key={k} k={k} o={o} onDone={onDone} />
        ))}
      </group>
    </>
  );
}

export function Obstacles() {
  useGame(s => s.objVersion);
  const list = runtime.world ? runtime.world.obstacles.filter(o => !isStatic(o)) : [];
  return (
    <>
      <ObstacleBatch />
      {list.map(o => (
        <Obstacle key={o.id} o={o} />
      ))}
    </>
  );
}

// --------------------------------------------------------- vending machines
const Vending = memo(function Vending({ v }) {
  const ref = useRef();
  const panel = useRef();
  const m = mats();
  const panelMat = useMemo(() => glow('#3dffb0', 1.4), []);
  const logoMat = useMemo(() => glow('#ffffff', 1.6), []);
  const place = () => {
    if (!ref.current) return;
    const w = {};
    const d = v.side * (v.w + 1.7);
    const h = toWorld(v.s, d, v.y, w);
    ref.current.position.set(w.x, w.y, w.z);
    // face the path
    ref.current.rotation.y = -h + (v.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  };
  useEffect(place, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  useOriginShift(place);
  useFrame(state => {
    const t = state.clock.elapsedTime;
    const used = v.used;
    panelMat.color.set(used ? '#2a8a6a' : '#3dffb0').multiplyScalar(used ? 1 : 1.4 + Math.sin(t * 5) * 0.4);
    if (panel.current) panel.current.scale.y = 1;
  });
  useLayoutEffect(() => {
    if (ref.current) mergeStatic(ref.current);
  }, []);
  return (
    <group ref={ref}>
      <RoundedBox args={[1.2, 2.2, 0.9]} radius={0.06} position={[0, 1.1, 0]} material={m.black} castShadow />
      <mesh ref={panel} position={[0, 1.3, -0.46]} material={panelMat}>
        <boxGeometry args={[0.9, 1.3, 0.02]} />
      </mesh>
      <mesh position={[0, 2.0, -0.465]} material={logoMat}>
        <boxGeometry args={[0.8, 0.22, 0.02]} />
      </mesh>
      {/* rows of cans behind the glass */}
      {[0, 1, 2, 3].map(r =>
        [-0.28, 0, 0.28].map(x => (
          <mesh key={`${r}${x}`} position={[x, 0.85 + r * 0.3, -0.42]} material={m.metal}>
            <cylinderGeometry args={[0.06, 0.06, 0.18, 8]} />
          </mesh>
        ))
      )}
    </group>
  );
});

export function VendingMachines() {
  useGame(s => s.objVersion);
  const list = runtime.world ? runtime.world.vending : [];
  return list.map(v => <Vending key={v.id} v={v} />);
}

// ------------------------------------------------------------------- pizza

const MAXP = 360;
export function Pickups() {
  const ref = useRef();
  const powers = useRef();
  const geo = useMemo(pizzaGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: new THREE.Color('#ff9a2a'), emissiveIntensity: 0.25 }), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const w = useMemo(() => ({}), []);
  useFrame(state => {
    const world = runtime.world;
    if (!world || !ref.current) return;
    const t = state.clock.elapsedTime;
    let n = 0;
    const r = world.runner;
    let pi = 0;
    for (const p of world.pickups) {
      if (p.s < r.s - 6 || p.s > r.s + 140) continue;
      if (p.kind !== 'pizza') {
        const g = powers.current && powers.current.children[pi++];
        if (g) placePower(g, p, world, t, w);
        continue;
      }
      if (n >= MAXP) break;
      let scale = 1;
      let lift = Math.sin(t * 3 + p.s) * 0.08;
      if (p.taken) {
        const k = (world.t - p.takenAt) / 0.22;
        if (k >= 1) continue;
        scale = 1 + k * 0.6;
        lift += k * 1.2;
        scale *= 1 - k;
      }
      if (p.dropped) {
        const k = Math.min(1, (world.t - p.bornAt) / 0.3);
        lift += (1 - k) * -0.6 + Math.sin(k * Math.PI) * 0.8;
      }
      const h = toWorld(p.s, p.d, p.y + lift, w);
      tmp.position.set(w.x, w.y, w.z);
      tmp.rotation.set(0.25, -h + t * 2.2 + p.s, 0);
      tmp.scale.setScalar(scale);
      tmp.updateMatrix();
      ref.current.setMatrixAt(n++, tmp.matrix);
    }
    ref.current.count = n;
    ref.current.instanceMatrix.needsUpdate = true;
    if (powers.current) for (let i = pi; i < powers.current.children.length; i++) powers.current.children[i].visible = false;
  }, -10);
  return (
    <>
      <instancedMesh ref={ref} args={[geo, mat, MAXP]} frustumCulled={false} castShadow />
      <group ref={powers}>
        {Array.from({ length: 6 }, (_, i) => (
          <PowerModel key={i} />
        ))}
      </group>
    </>
  );
}

const POWER_COLORS = { magnet: '#ff3b5c', coffee: '#c8874a', hoodie: '#6fd3ff', sixpack: '#3dffb0', golden: '#ffd23f' };
const RETICLE = new THREE.Color('#ff5a4a').multiplyScalar(2);
const GOLD = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.9, roughness: 0.2, emissive: new THREE.Color('#ff9a1a'), emissiveIntensity: 0.6 });
let goldGeo = null;
function PowerModel() {
  const m = mats();
  return (
    <group visible={false}>
      <mesh name="halo">
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </mesh>
      <group name="magnet">
        <mesh position={[-0.16, 0, 0]} material={m.red}>
          <boxGeometry args={[0.12, 0.42, 0.12]} />
        </mesh>
        <mesh position={[0.16, 0, 0]} material={m.red}>
          <boxGeometry args={[0.12, 0.42, 0.12]} />
        </mesh>
        <mesh position={[0, -0.2, 0]} material={m.red}>
          <boxGeometry args={[0.44, 0.12, 0.12]} />
        </mesh>
        {[-0.16, 0.16].map(x => (
          <mesh key={x} position={[x, 0.25, 0]} material={m.white}>
            <boxGeometry args={[0.13, 0.1, 0.13]} />
          </mesh>
        ))}
      </group>
      <group name="coffee">
        <mesh material={m.white}>
          <cylinderGeometry args={[0.17, 0.13, 0.42, 12]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={m.wood}>
          <cylinderGeometry args={[0.175, 0.16, 0.14, 12]} />
        </mesh>
        <mesh position={[0, 0.25, 0]} material={m.dark}>
          <cylinderGeometry args={[0.18, 0.18, 0.06, 12]} />
        </mesh>
      </group>
      <group name="hoodie">
        <RoundedBox args={[0.46, 0.46, 0.18]} radius={0.06} material={m.blue} />
        {[-1, 1].map(s => (
          <mesh key={s} position={[s * 0.3, 0.06, 0]} rotation={[0, 0, s * 0.6]} material={m.blue}>
            <capsuleGeometry args={[0.07, 0.24, 2, 6]} />
          </mesh>
        ))}
      </group>
      <group name="golden" scale={1.5}>
        <mesh geometry={goldGeo || (goldGeo = pizzaGeometry())} material={GOLD} />
      </group>
      <group name="sixpack">
        {[0, 1, 2].map(i =>
          [0, 1].map(j => (
            <mesh key={`${i}${j}`} position={[(i - 1) * 0.15, 0, (j - 0.5) * 0.15]} material={m.metal}>
              <cylinderGeometry args={[0.065, 0.065, 0.24, 10]} />
            </mesh>
          ))
        )}
      </group>
    </group>
  );
}

function placePower(g, p, world, t, w) {
  if (p.taken) {
    g.visible = false;
    return;
  }
  g.visible = true;
  toWorld(p.s, p.d, p.y + Math.sin(t * 2.5 + p.s) * 0.12, w);
  g.position.set(w.x, w.y, w.z);
  g.rotation.y = t * 1.8;
  for (const c of g.children) {
    if (c.name === 'halo') {
      c.material.color.set(POWER_COLORS[p.kind]).multiplyScalar(1.6);
      c.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    } else c.visible = c.name === p.kind;
  }
}

// -------------------------------------------------------------------- cans
const CANS = 10;
export function Cans() {
  const group = useRef();
  const c = useMemo(canAssets, []);
  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  useFrame(state => {
    const world = runtime.world;
    if (!world || !group.current) return;
    const kids = group.current.children;
    let i = 0;
    for (const c of world.cans) {
      if (i >= CANS) break;
      const o = kids[i++];
      lerpEntity(c, runtime.prevCans, q);
      toWorld(q.s, q.d, q.y, w);
      o.position.set(w.x, w.y, w.z);
      o.rotation.set(state.clock.elapsedTime * 22, 0, 0.5);
      o.visible = true;
    }
    for (; i < CANS; i++) kids[i].visible = false;
  }, -10);
  return (
    <group ref={group}>
      {Array.from({ length: CANS }, (_, i) => (
        <group key={i} visible={false} scale={2.4}>
          <mesh geometry={c.geo} material={c.body} castShadow />
          <mesh geometry={c.tabGeo} material={c.tab} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------- aim line (keyboard players)
export function AimLine() {
  const ref = useRef();
  const reticle = useRef();
  const touch = useGame(s => s.touch);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const N = 24;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const along = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) along[i * 2] = along[i * 2 + 1] = i / (N - 1);
    g.setAttribute('along', new THREE.BufferAttribute(along, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.setIndex(idx);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uOn: { value: 0 }, uTime: { value: 0 } },
        vertexShader: `attribute float along; varying float vA; void main(){ vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOn; uniform float uTime; varying float vA;
          void main(){ float dash = step(0.45, fract(vA * 14.0 - uTime * 2.0)); float a = (1.0 - vA) * mix(0.16, 0.6, uOn) * dash; gl_FragColor = vec4(uColor, a); }`,
      }),
    []
  );
  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  useFrame(state => {
    const world = runtime.world;
    if (!world || !ref.current) return;
    const show = runtime.mode === 'play' && !touch && !world.over && (world.canCount > 0 || world.power.sixpack > 0);
    ref.current.visible = show;
    reticle.current.visible = false;
    if (!show) return;
    runnerLerp(q);
    // find the rider the next can would go for (same rule as the sim)
    let target = null;
    let best = Infinity;
    for (const rd of world.riders) {
      if (rd.state !== 'ride') continue;
      const ds = rd.s - q.s;
      if (ds < 2 || ds > 55) continue;
      const assist = 0.75 + ds * 0.04;
      const dd = Math.abs(rd.d - q.d - 0.25);
      if (dd > assist) continue;
      const sc = dd / assist + ds / 55;
      if (sc < best) {
        best = sc;
        target = rd;
      }
    }
    mat.uniforms.uOn.value += ((target ? 1 : 0) - mat.uniforms.uOn.value) * 0.25;
    mat.uniforms.uColor.value.set(target ? '#ff5a4a' : '#ffffff');
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    const pos = geo.attributes.position.array;
    const N = pos.length / 6;
    const len = target ? Math.max(4, target.s - q.s) : 28;
    for (let i = 0; i < N; i++) {
      const s = q.s + 1 + (len * i) / (N - 1);
      const d = target ? q.d + ((target.d - q.d) * i) / (N - 1) : q.d;
      const g = world.surfaces.groundAt(s, d, q.y + 2);
      const y = (g ? g.h : q.y) + 0.06;
      for (let k = 0; k < 2; k++) {
        toWorld(s, d + (k ? 0.09 : -0.09), y, w);
        pos.set([w.x, w.y, w.z], (i * 2 + k) * 3);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
    if (target) {
      toWorld(target.s, target.d, (target.y ?? 0) + 2.25, w);
      reticle.current.visible = true;
      reticle.current.position.set(w.x, w.y, w.z);
      reticle.current.rotation.z = state.clock.elapsedTime * 3;
      reticle.current.quaternion.copy(state.camera.quaternion);
    }
  }, -5);
  return (
    <>
      <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />
      <mesh ref={reticle} visible={false} renderOrder={4}>
        <ringGeometry args={[0.22, 0.3, 4]} />
        <meshBasicMaterial color={RETICLE} toneMapped={false} depthTest={false} transparent />
      </mesh>
    </>
  );
}

// "YOUR BEST" finish line across the path at your record distance
export function BestMarker() {
  const best = useGame(s => (s.stats ? Math.round(s.stats.longest) : 0));
  const phase = useGame(s => s.phase);
  const ref = useRef();
  const fired = useRef(false);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1230';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 504, 88);
    g.fillStyle = '#ffd23f';
    g.font = '900 54px Arial Black, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(`YOUR BEST  ${best} m`, 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [best]);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  const tape = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(2.2), toneMapped: false }), []);
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5 }), []);
  useEffect(() => {
    fired.current = false;
  }, [best, phase]);
  useFrame(state => {
    const world = runtime.world;
    const g = ref.current;
    if (!world || !g) return;
    const show = runtime.mode === 'play' && best > 50 && world.runner.s < best + 30 && best - world.runner.s < 260;
    g.visible = show;
    if (!show) return;
    const seg = world.segments.find(x => best >= x.s0 && best <= x.s1);
    const ground = world.surfaces.groundAt(best, 0, 1e9);
    const w = {};
    const h = toWorld(best, 0, ground ? ground.h : world.runner.y, w);
    g.position.set(w.x, w.y, w.z);
    g.rotation.y = -h;
    const half = seg && seg.w ? seg.w : 4;
    g.scale.set(half / 4, 1, 1);
    g.children[0].material.color.setScalar(1.6 + Math.sin(state.clock.elapsedTime * 6) * 0.6);
    if (!fired.current && world.runner.s > best) {
      fired.current = true;
      emit('passedBest', { best });
    }
  });
  return (
    <group ref={ref} visible={false}>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={tape}>
        <planeGeometry args={[8, 0.5]} />
      </mesh>
      {[-1, 1].map(sd => (
        <mesh key={sd} position={[sd * 4.4, 2.2, 0]} material={pole}>
          <cylinderGeometry args={[0.07, 0.07, 4.4, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 4.1, 0]} material={signMat}>
        <planeGeometry args={[8.8, 1.65]} />
      </mesh>
    </group>
  );
}
