import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, runnerLerp, lerpEntity, toWorld } from '../core/runtime';
import { useGame } from '../core/store';
import { Builder } from './geo';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true, ...o });
const glow = (c, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

let M = null;
function mats() {
  if (M) return M;
  M = {
    yellow: std('#ffd23f'),
    black: std('#1d1d22'),
    white: std('#f4f1ea'),
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
    gooseNeck: std('#2b2b2b'),
    beak: std('#ff9a2a'),
    skin: std('#e9b48f'),
    banner: [std('#ffb02e'), std('#3f8fe8'), std('#8f5fe8'), std('#e8476a')],
    shirts: ['#3fb4e8', '#8f5fe8', '#e8476a', '#2fbf8f', '#f2c63a', '#ff8a3d'].map(c => std(c)),
    pants: std('#2b3242'),
    lampGlow: glow('#ffd9a0', 1.8),
    robotEye: glow('#3dffb0', 2),
    flag: glow('#ff3b30', 1.6),
  };
  return M;
}

// ------------------------------------------------------------------ models
function Person({ shirt, guide }) {
  const m = mats();
  return (
    <group>
      {[-0.1, 0.1].map(x => (
        <mesh key={x} position={[x, 0.42, 0]} material={m.pants} castShadow>
          <capsuleGeometry args={[0.08, 0.66, 3, 6]} />
        </mesh>
      ))}
      <RoundedBox args={[0.46, 0.6, 0.3]} radius={0.09} position={[0, 1.12, 0]} material={shirt} castShadow />
      <RoundedBox args={[0.36, 0.38, 0.36]} radius={0.13} position={[0, 1.62, 0]} material={m.skin} castShadow />
      {guide && (
        <>
          <mesh position={[0.3, 1.9, 0]} material={m.dark}>
            <cylinderGeometry args={[0.015, 0.015, 1.3, 4]} />
          </mesh>
          <mesh position={[0.48, 2.45, 0]} material={m.flag}>
            <boxGeometry args={[0.36, 0.24, 0.02]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function ObstacleModel({ o }) {
  const m = mats();
  const w2 = o.hw * 2;
  switch (o.model) {
    case 'wetfloor':
      return (
        <group>
          <mesh position={[0, 0.38, 0.1]} rotation={[-0.25, 0, 0]} material={m.yellow} castShadow>
            <boxGeometry args={[0.55, 0.78, 0.03]} />
          </mesh>
          <mesh position={[0, 0.38, -0.1]} rotation={[0.25, 0, 0]} material={m.yellow} castShadow>
            <boxGeometry args={[0.55, 0.78, 0.03]} />
          </mesh>
          <mesh position={[0, 0.45, -0.18]} rotation={[0.25, 0, 0]} material={m.black}>
            <boxGeometry args={[0.2, 0.2, 0.01]} />
          </mesh>
        </group>
      );
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
          <RoundedBox args={[0.3, 0.05, 0.85]} radius={0.02} position={[0, 0.12, 0]} rotation={[0, 0.6, 0]} material={m.red} castShadow />
          <RoundedBox args={[0.5, 0.55, 0.4]} radius={0.12} position={[0.4, 0.3, 0.2]} material={m.blue} castShadow />
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
            <mesh key={y} position={[0, y, 0]} rotation={[0, i * 0.3, 0]} material={m.wood} castShadow>
              <boxGeometry args={[Math.min(1.1, w2), 0.78, 0.8]} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.38, 0]} material={m.wood} castShadow>
          <boxGeometry args={[w2, 0.76, 0.8]} />
        </mesh>
      );
    case 'hedgeRow':
    case 'planterRow':
      return (
        <group>
          <mesh position={[0, 0.2, 0]} material={o.model === 'planterRow' ? m.concrete : m.wood} castShadow>
            <boxGeometry args={[w2, 0.4, 0.8]} />
          </mesh>
          <mesh position={[0, 0.6, 0]} material={m.hedge} castShadow>
            <boxGeometry args={[w2 - 0.1, 0.45, 0.7]} />
          </mesh>
          {Array.from({ length: Math.round(w2 / 0.9) }, (_, i) => (
            <mesh key={i} position={[-w2 / 2 + 0.45 + i * 0.9, 0.86, 0]} material={m.flower}>
              <icosahedronGeometry args={[0.1, 0]} />
            </mesh>
          ))}
        </group>
      );
    case 'clubBanner':
    case 'beam': {
      const beam = o.model === 'beam';
      const bm = m.banner[o.id % 4];
      return (
        <group>
          {[-1, 1].map(s => (
            <mesh key={s} position={[(s * w2) / 2, 1.4, 0]} material={beam ? m.yellow : m.dark} castShadow>
              <boxGeometry args={[0.16, 2.8, 0.16]} />
            </mesh>
          ))}
          <mesh position={[0, o.clear + 0.5, 0]} material={beam ? m.yellow : bm} castShadow>
            <boxGeometry args={[w2, beam ? 0.4 : 0.95, beam ? 0.4 : 0.05]} />
          </mesh>
          {beam ? (
            <mesh position={[0, o.clear + 0.5, -0.21]} material={m.black}>
              <boxGeometry args={[w2 * 0.98, 0.12, 0.01]} />
            </mesh>
          ) : (
            <mesh position={[0, o.clear + 0.5, -0.03]} material={m.white}>
              <boxGeometry args={[w2 * 0.6, 0.18, 0.01]} />
            </mesh>
          )}
        </group>
      );
    }
    case 'lamp':
      return (
        <group>
          <mesh position={[0, 0.2, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.26, 0.32, 0.4, 8]} />
          </mesh>
          <mesh position={[0, 1.8, 0]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 3.4, 8]} />
          </mesh>
          <mesh position={[0, 3.6, 0]} material={m.lampGlow}>
            <sphereGeometry args={[0.22, 10, 8]} />
          </mesh>
        </group>
      );
    case 'bikeRack':
      return (
        <group>
          <mesh position={[0, 1.1, 0]} material={m.blue} castShadow>
            <boxGeometry args={[Math.min(1.2, w2), 2.2, 0.35]} />
          </mesh>
          <mesh position={[0, 1.6, -0.18]} material={m.white}>
            <boxGeometry args={[0.7, 0.5, 0.02]} />
          </mesh>
        </group>
      );
    case 'trashcan':
      return (
        <group>
          <mesh position={[0, 1, 0]} material={m.green} castShadow>
            <cylinderGeometry args={[Math.min(0.55, o.hw), Math.min(0.5, o.hw), 2, 10]} />
          </mesh>
          <mesh position={[0, 2.05, 0]} material={m.dark}>
            <cylinderGeometry args={[Math.min(0.6, o.hw + 0.05), Math.min(0.6, o.hw + 0.05), 0.12, 10]} />
          </mesh>
        </group>
      );
    case 'sign':
      return (
        <group>
          <mesh position={[0, 1.2, 0]} material={m.dark}>
            <boxGeometry args={[0.1, 2.4, 0.1]} />
          </mesh>
          <mesh position={[0, 1.8, -0.06]} material={m.white} castShadow>
            <boxGeometry args={[Math.min(1.2, w2), 0.9, 0.06]} />
          </mesh>
        </group>
      );
    case 'portapotty':
      return (
        <RoundedBox args={[Math.min(1.2, w2), 2.3, 1.1]} radius={0.06} position={[0, 1.15, 0]} material={m.blue} castShadow />
      );
    case 'student':
      return <Person shirt={m.shirts[(o.seed || 0) % m.shirts.length]} />;
    case 'tourist':
      return <Person shirt={m.shirts[(o.seed || 0) % m.shirts.length]} guide={(o.seed || 0) % 5 === 0} />;
    case 'goose':
      return (
        <group>
          <mesh position={[0, 0.34, 0.08]} scale={[0.8, 0.7, 1.2]} material={m.goose} castShadow>
            <sphereGeometry args={[0.28, 10, 8]} />
          </mesh>
          <mesh position={[0, 0.6, -0.22]} rotation={[0.3, 0, 0]} material={m.gooseNeck}>
            <cylinderGeometry args={[0.05, 0.06, 0.42, 6]} />
          </mesh>
          <mesh position={[0, 0.82, -0.3]} material={m.gooseNeck}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
          <mesh position={[0, 0.8, -0.42]} rotation={[-Math.PI / 2, 0, 0]} material={m.beak}>
            <coneGeometry args={[0.04, 0.14, 6]} />
          </mesh>
        </group>
      );
    case 'robot':
      return (
        <group>
          <RoundedBox args={[0.62, 0.48, 0.78]} radius={0.12} position={[0, 0.42, 0]} material={m.white} castShadow />
          <mesh position={[0, 0.48, -0.4]} material={m.robotEye}>
            <boxGeometry args={[0.4, 0.08, 0.02]} />
          </mesh>
          <mesh position={[0.2, 0.95, 0.25]} material={m.dark}>
            <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
          </mesh>
          <mesh position={[0.2, 1.25, 0.25]} material={m.flag}>
            <boxGeometry args={[0.16, 0.1, 0.01]} />
          </mesh>
          {[-0.3, 0.3].map(x =>
            [-0.25, 0.25].map(z => (
              <mesh key={`${x}${z}`} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]} material={m.black}>
                <cylinderGeometry args={[0.11, 0.11, 0.08, 10]} />
              </mesh>
            ))
          )}
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

export function Obstacles() {
  useGame(s => s.objVersion);
  const list = runtime.world ? runtime.world.obstacles : [];
  return list.map(o => <Obstacle key={o.id} o={o} />);
}

// --------------------------------------------------------- vending machines
const Vending = memo(function Vending({ v }) {
  const ref = useRef();
  const panel = useRef();
  const m = mats();
  const panelMat = useMemo(() => glow('#3dffb0', 1.4), []);
  const logoMat = useMemo(() => glow('#ffffff', 1.6), []);
  useEffect(() => {
    if (!ref.current) return;
    const w = {};
    const d = v.side * (v.w + 1.7);
    const h = toWorld(v.s, d, v.y, w);
    ref.current.position.set(w.x, w.y, w.z);
    // face the path
    ref.current.rotation.y = -h + (v.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }, [v]);
  useFrame(state => {
    const t = state.clock.elapsedTime;
    const used = v.used;
    panelMat.color.set(used ? '#2a8a6a' : '#3dffb0').multiplyScalar(used ? 1 : 1.4 + Math.sin(t * 5) * 0.4);
    if (panel.current) panel.current.scale.y = 1;
  });
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
function pizzaGeometry() {
  const b = new Builder();
  // a wedge: cheese top, crust edge, pepperoni
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.36);
  shape.lineTo(-0.3, 0.26);
  shape.quadraticCurveTo(0, 0.34, 0.3, 0.26);
  shape.lineTo(0, -0.36);
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  wedge.translate(0, 0, -0.03);
  b.add(wedge, { color: '#ffc845', jitter: 0 });
  b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.64, 8), { pos: [0, 0.29, 0], rot: [0, 0, Math.PI / 2], color: '#d98a3a', jitter: 0 });
  for (const [x, y] of [
    [-0.08, 0.1],
    [0.1, 0.05],
    [0, -0.12],
  ])
    b.add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10), { pos: [x, y, 0.04], rot: [Math.PI / 2, 0, 0], color: '#d6402f', jitter: 0 });
  return b.build();
}

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

const POWER_COLORS = { magnet: '#ff3b5c', coffee: '#c8874a', hoodie: '#6fd3ff', sixpack: '#3dffb0' };
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
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3dffb0', metalness: 0.7, roughness: 0.25, emissive: new THREE.Color('#1aa070'), emissiveIntensity: 0.6 }), []);
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
        <mesh key={i} material={m} visible={false} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.22, 10]} />
        </mesh>
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
        <meshBasicMaterial color={new THREE.Color('#ff5a4a').multiplyScalar(2)} toneMapped={false} depthTest={false} transparent />
      </mesh>
    </>
  );
}
