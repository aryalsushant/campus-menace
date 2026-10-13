import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, lerpEntity, toWorld } from '../core/runtime';
import { on } from '../core/bus';

// Scooter riders. A fixed pool of models is assigned to live riders each
// frame. Takedowns turn the rider and the scooter into tumbling debris.

const POOL = 12;
const OUTFITS = ['#3fb4e8', '#8f5fe8', '#e8476a', '#2fbf8f', '#f2c63a', '#6b7280', '#ff8a3d', '#1f2937'];
const SKINS = ['#f1c7a3', '#d9a07a', '#a96f4a', '#7a4a2f', '#f5d6bf'];
const HAIRS = ['#1b1210', '#3a2418', '#7a4a20', '#d8b060', '#2a2a2a'];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glowMat = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false });

function RiderModel({ slot }) {
  const root = useRef();
  const person = useRef();
  const scooter = useRef();
  const ring = useRef();
  const legs = useRef();
  const armPhone = useRef();
  const mats = useMemo(
    () => ({
      outfit: std(OUTFITS[slot % OUTFITS.length]),
      pants: std(slot % 3 ? '#2b3242' : '#4a5a7a', { roughness: 0.85 }),
      skin: std(SKINS[slot % SKINS.length]),
      hair: std(HAIRS[(slot * 3) % HAIRS.length], { roughness: 0.85 }),
      deck: std('#22252e', { roughness: 0.4, metalness: 0.4 }),
      stem: std('#c9ced8', { roughness: 0.3, metalness: 0.7 }),
      wheel: std('#151515', { roughness: 0.6 }),
      led: glowMat('#ff3b30'),
      phone: glowMat('#9fd8ff'),
      white: std('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30').multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    }),
    [slot]
  );
  useEffect(() => {
    runtime.riderSlots = runtime.riderSlots || [];
    runtime.riderSlots[slot] = { root, person, scooter, ring, legs, armPhone };
  }, [slot]);
  return (
    <group ref={root} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={mats.ring}>
        <ringGeometry args={[0.7, 0.95, 24]} />
      </mesh>
      <group ref={scooter}>
        <RoundedBox args={[0.24, 0.07, 1.05]} radius={0.03} position={[0, 0.16, 0]} material={mats.deck} castShadow />
        <mesh position={[0.125, 0.16, 0]} material={mats.led}>
          <boxGeometry args={[0.02, 0.03, 0.9]} />
        </mesh>
        <mesh position={[-0.125, 0.16, 0]} material={mats.led}>
          <boxGeometry args={[0.02, 0.03, 0.9]} />
        </mesh>
        <mesh position={[0, 0.7, -0.5]} rotation={[0.18, 0, 0]} material={mats.stem} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 1.1, 8]} />
        </mesh>
        <mesh position={[0, 1.24, -0.6]} rotation={[0, 0, Math.PI / 2]} material={mats.stem}>
          <cylinderGeometry args={[0.022, 0.022, 0.5, 8]} />
        </mesh>
        <mesh position={[0, 1.18, -0.62]} material={mats.led}>
          <sphereGeometry args={[0.05, 8, 6]} />
        </mesh>
        {[-0.5, 0.48].map(z => (
          <mesh key={z} position={[0, 0.1, z]} rotation={[0, 0, Math.PI / 2]} material={mats.wheel} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.07, 12]} />
          </mesh>
        ))}
      </group>
      <group ref={person} position={[0, 0.2, 0.05]}>
        <group ref={legs}>
          {[-0.1, 0.1].map((x, i) => (
            <mesh key={x} position={[x, 0.42, i ? 0.12 : -0.12]} material={mats.pants} castShadow>
              <capsuleGeometry args={[0.08, 0.66, 3, 8]} />
            </mesh>
          ))}
        </group>
        <RoundedBox args={[0.46, 0.56, 0.3]} radius={0.09} position={[0, 1.08, 0]} material={mats.outfit} castShadow />
        <RoundedBox args={[0.36, 0.38, 0.36]} radius={0.13} position={[0, 1.58, 0]} material={mats.skin} castShadow />
        <RoundedBox args={[0.39, 0.16, 0.39]} radius={0.07} position={[0, 1.73, 0.02]} material={mats.hair} />
        {/* AirPods */}
        {[-0.19, 0.19].map(x => (
          <mesh key={x} position={[x, 1.56, 0]} material={mats.white}>
            <sphereGeometry args={[0.035, 6, 4]} />
          </mesh>
        ))}
        {/* left hand on the bar */}
        <mesh position={[-0.24, 1.1, -0.35]} rotation={[1.1, 0, 0.2]} material={mats.outfit} castShadow>
          <capsuleGeometry args={[0.065, 0.42, 3, 6]} />
        </mesh>
        {/* right hand holding a phone up to the face */}
        <group ref={armPhone} position={[0.24, 1.28, 0]}>
          <mesh position={[0, -0.06, -0.16]} rotation={[1.2, 0, -0.3]} material={mats.outfit} castShadow>
            <capsuleGeometry args={[0.065, 0.3, 3, 6]} />
          </mesh>
          <mesh position={[-0.08, 0.16, -0.32]} rotation={[0.2, 0, 0]} material={mats.phone}>
            <boxGeometry args={[0.1, 0.18, 0.015]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function Riders() {
  const debris = useRef(new Map()); // riderId -> tumble state
  useEffect(() => {
    const offs = [
      on('takedown', e => {
        const rd = runtime.world.riders.find(r => r.id === e.id);
        if (!rd) return;
        const p = {};
        const h = toWorld(rd.s, rd.d, rd.y ?? 0, p);
        // knocked away from the student, scooter spins off sideways
        const away = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
        const side = new THREE.Vector3(Math.cos(h), 0, Math.sin(h)).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
        const kick = e.how === 'can' ? 7 : 9;
        debris.current.set(e.id, {
          t: 0,
          ground: rd.y ?? 0,
          person: { p: new THREE.Vector3(p.x, p.y, p.z), v: away.clone().multiplyScalar(kick).add(side.clone().multiplyScalar(1.5)).setY(6.5), r: new THREE.Euler(0, -h, 0), w: new THREE.Vector3(-7, Math.random() * 4 - 2, (Math.random() - 0.5) * 6) },
          scooter: { p: new THREE.Vector3(p.x, p.y, p.z), v: side.clone().multiplyScalar(5).add(away.clone().multiplyScalar(3)).setY(5), r: new THREE.Euler(0, -h, 0), w: new THREE.Vector3(9, 6, 4) },
        });
      }),
      on('worldReset', () => debris.current.clear()),
    ];
    return () => offs.forEach(f => f());
  }, []);

  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  useFrame((state, rawDt) => {
    const world = runtime.world;
    const slots = runtime.riderSlots;
    if (!world || !slots) return;
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    const t = state.clock.elapsedTime;
    let i = 0;
    for (const rd of world.riders) {
      if (i >= POOL) break;
      const sl = slots[i++];
      if (!sl || !sl.root.current) continue;
      const root = sl.root.current;
      root.visible = true;
      const D = debris.current.get(rd.id);
      if (rd.state === 'down' && D) {
        D.t += dt;
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);
        root.scale.setScalar(1);
        sl.ring.current.visible = false;
        for (const [part, obj] of [
          [D.person, sl.person.current],
          [D.scooter, sl.scooter.current],
        ]) {
          part.v.y -= 24 * dt;
          part.p.addScaledVector(part.v, dt);
          if (part.p.y < D.ground) {
            part.p.y = D.ground;
            part.v.y *= -0.35;
            part.v.x *= 0.7;
            part.v.z *= 0.7;
            part.w.multiplyScalar(0.6);
          }
          part.r.x += part.w.x * dt;
          part.r.y += part.w.y * dt;
          part.r.z += part.w.z * dt;
          obj.position.copy(part.p);
          obj.rotation.copy(part.r);
        }
        // fade out after a while
        if (D.t > 3.2) root.visible = false;
        continue;
      }
      // alive: place on the path, face the travel direction
      lerpEntity(rd, runtime.prevRiders, q);
      const h = toWorld(q.s, q.d, q.y, w);
      root.position.set(w.x, w.y, w.z);
      const lean = rd.lean || 0;
      const yawLocal = Math.atan2(-lean, rd.vs || -0.001);
      root.rotation.set(0, -h + yawLocal, 0);
      const born = Math.min(1, (world.t - rd.bornAt) / 0.35);
      root.scale.setScalar(0.4 + 0.6 * born);
      sl.person.current.position.set(0, 0.2 + Math.sin(t * 9 + rd.id) * 0.01, 0.05);
      sl.person.current.rotation.set(0, 0, THREE.MathUtils.clamp(-lean * 0.08, -0.35, 0.35));
      sl.scooter.current.position.set(0, 0, 0);
      sl.scooter.current.rotation.set(0, 0, THREE.MathUtils.clamp(-lean * 0.05, -0.25, 0.25));
      sl.ring.current.visible = true;
      sl.ring.current.material.opacity = 0.25 + Math.sin(t * 8 + rd.id) * 0.1;
      sl.armPhone.current.rotation.x = Math.sin(t * 2 + rd.id) * 0.05;
    }
    for (; i < POOL; i++) if (slots[i] && slots[i].root.current) slots[i].root.current.visible = false;
  }, -20);

  return Array.from({ length: POOL }, (_, i) => <RiderModel key={i} slot={i} />);
}
