import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, lerpEntity, toWorld } from '../core/runtime';
import { on } from '../core/bus';
import { withRim } from './materials';
import { loadPeople, makePerson, randomLook, attach, bindPosition } from './people';

// Scooter riders. A fixed pool of models is assigned to live riders each
// frame. Takedowns turn the rider and the scooter into tumbling debris.

const POOL = 12;

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glowMat = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false });

function Wheel({ z, mats }) {
  return (
    <group position={[0, 0.1, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh material={mats.tire} castShadow>
        <torusGeometry args={[0.078, 0.026, 10, 20]} />
      </mesh>
      <mesh material={mats.hub}>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 14]} />
      </mesh>
    </group>
  );
}

function RiderModel({ slot }) {
  const root = useRef();
  const person = useRef();
  const scooter = useRef();
  const ring = useRef();
  const mats = useMemo(
    () => ({
      deck: std('#2a2d35', { roughness: 0.45, metalness: 0.4 }),
      grip: std('#121214', { roughness: 0.95 }),
      stem: std('#cfd5de', { roughness: 0.25, metalness: 0.85 }),
      accent: std(['#3dffb0', '#9be15d', '#3fb4e8'][slot % 3], { roughness: 0.4, metalness: 0.3 }),
      tire: std('#141416', { roughness: 0.8 }),
      hub: std('#9aa3ad', { roughness: 0.35, metalness: 0.8 }),
      led: glowMat('#ff3b30'),
      head: glowMat('#fff4d6'),
      phone: glowMat('#9fd8ff'),
      black: std('#111111'),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30').multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    }),
    [slot]
  );
  const rig = useRef(null);
  useEffect(() => {
    runtime.riderSlots = runtime.riderSlots || [];
    runtime.riderSlots[slot] = { root, person, scooter, ring, rig };
    let live = true;
    loadPeople().then(() => {
      if (!live || !person.current) return;
      const look = randomLook(slot * 7919 + 13);
      const p = makePerson({ ...look, outfit: { ...look.outfit, rim: '#ffd9b8', rimStrength: 0.35 } });
      // both hands low and forward: texting while riding
      p.play('Pistol_Aim_Down');
      const hand = bindPosition(p, 'hand_r');
      const phone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), mats.black);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.135, 0.004), mats.phone);
      screen.position.z = 0.008;
      phone.add(body, screen);
      attach(p, 'hand_r', phone, { pos: [hand.x - 0.05, hand.y + 0.02, hand.z + 0.06], rot: [-0.9, 0, 0] });
      person.current.add(p.root);
      rig.current = p;
    });
    return () => {
      live = false;
    };
  }, [slot, mats]);
  const M = mats;
  return (
    <group ref={root} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={M.ring}>
        <ringGeometry args={[0.75, 1.0, 28]} />
      </mesh>
      {/* ------------------------------------------------ e-scooter */}
      <group ref={scooter}>
        <RoundedBox args={[0.19, 0.06, 0.66]} radius={0.025} position={[0, 0.16, 0.02]} material={M.deck} castShadow />
        <mesh position={[0, 0.193, 0.02]} material={M.grip}>
          <boxGeometry args={[0.165, 0.008, 0.56]} />
        </mesh>
        {[-1, 1].map(sd => (
          <mesh key={sd} position={[sd * 0.097, 0.15, 0.02]} material={M.led}>
            <boxGeometry args={[0.008, 0.018, 0.56]} />
          </mesh>
        ))}
        <mesh position={[0, 0.17, 0.34]} material={M.accent}>
          <boxGeometry args={[0.15, 0.04, 0.06]} />
        </mesh>
        {/* rear fender + brake light */}
        <mesh position={[0, 0.12, 0.4]} rotation={[0, Math.PI / 2, 0]} material={M.deck}>
          <torusGeometry args={[0.11, 0.022, 6, 14, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.2, 0.5]} material={M.led}>
          <boxGeometry args={[0.06, 0.025, 0.01]} />
        </mesh>
        <Wheel z={0.4} mats={M} />
        <Wheel z={-0.42} mats={M} />
        {/* fork + stem, handlebar, grips, display, headlight */}
        <mesh position={[0, 0.62, -0.47]} rotation={[0.1, 0, 0]} material={M.stem} castShadow>
          <cylinderGeometry args={[0.026, 0.03, 1.05, 10]} />
        </mesh>
        <mesh position={[0, 0.27, -0.42]} rotation={[0.1, 0, 0]} material={M.deck}>
          <boxGeometry args={[0.07, 0.24, 0.05]} />
        </mesh>
        <mesh position={[0, 1.13, -0.52]} rotation={[0, 0, Math.PI / 2]} material={M.stem}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 8]} />
        </mesh>
        {[-1, 1].map(sd => (
          <mesh key={sd} position={[sd * 0.22, 1.13, -0.52]} rotation={[0, 0, Math.PI / 2]} material={M.grip}>
            <cylinderGeometry args={[0.024, 0.024, 0.1, 8]} />
          </mesh>
        ))}
        <mesh position={[0, 1.15, -0.5]} rotation={[-0.6, 0, 0]} material={M.phone}>
          <boxGeometry args={[0.07, 0.04, 0.008]} />
        </mesh>
        <mesh position={[0, 1.02, -0.55]} material={M.head}>
          <sphereGeometry args={[0.035, 10, 8]} />
        </mesh>
      </group>
      {/* ------------------------------------------------ rider (rigged person, added on load) */}
      <group ref={person} position={[0, 0.2, 0.05]} />
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
      const P = sl.rig && sl.rig.current;
      if (P) {
        if (rd.state === 'down') P.play('Death01', { loop: false, timeScale: 1.4, fade: 0.05 });
        else P.play('Pistol_Aim_Down', { fade: 0.1 });
        P.mixer.update(dt);
      }
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
      sl.person.current.position.set(0, 0.2 + Math.sin(t * 9 + rd.id) * 0.012, 0.05);
      sl.person.current.rotation.set(0, 0, THREE.MathUtils.clamp(-lean * 0.08, -0.35, 0.35));
      sl.scooter.current.position.set(0, 0, 0);
      sl.scooter.current.rotation.set(0, 0, THREE.MathUtils.clamp(-lean * 0.05, -0.25, 0.25));
      sl.ring.current.visible = true;
      sl.ring.current.material.opacity = 0.25 + Math.sin(t * 8 + rd.id) * 0.1;
    }
    for (; i < POOL; i++) if (slots[i] && slots[i].root.current) slots[i].root.current.visible = false;
  }, -20);

  return Array.from({ length: POOL }, (_, i) => <RiderModel key={i} slot={i} />);
}
