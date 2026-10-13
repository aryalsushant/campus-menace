import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, lerpEntity, toWorld } from '../core/runtime';
import { on } from '../core/bus';
import { withRim } from './materials';

// Scooter riders. A fixed pool of models is assigned to live riders each
// frame. Takedowns turn the rider and the scooter into tumbling debris.

const POOL = 12;
const OUTFITS = ['#3fb4e8', '#8f5fe8', '#e8476a', '#2fbf8f', '#f2c63a', '#6b7280', '#ff8a3d', '#1f2937'];
const SKINS = ['#f1c7a3', '#d9a07a', '#a96f4a', '#7a4a2f', '#f5d6bf'];
const HAIRS = ['#1b1210', '#3a2418', '#7a4a20', '#d8b060', '#2a2a2a'];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glowMat = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.6), toneMapped: false });
const HAIR_STYLES = ['short', 'cap', 'bun', 'long', 'buzz'];

// limb helper: a tapered cylinder from the joint down `len`
function Limb({ len, r, r2 = r * 0.85, material, rot = [0, 0, 0], pos = [0, 0, 0], children }) {
  return (
    <group position={pos} rotation={rot}>
      <mesh position={[0, -len / 2, 0]} material={material} castShadow>
        <cylinderGeometry args={[r, r2, len, 10]} />
      </mesh>
      <mesh material={material}>
        <sphereGeometry args={[r, 10, 8]} />
      </mesh>
      <group position={[0, -len, 0]}>{children}</group>
    </group>
  );
}

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
  const legs = useRef();
  const armPhone = useRef();
  const look = useMemo(() => {
    const rnd = (k, n) => (slot * 7 + k * 13) % n;
    return { hair: HAIR_STYLES[rnd(1, HAIR_STYLES.length)], pack: slot % 3 === 0, beanie: slot % 5 === 4 };
  }, [slot]);
  const mats = useMemo(
    () => ({
      outfit: withRim(std(OUTFITS[slot % OUTFITS.length], { roughness: 0.75 }), '#ffe6c8', 0.45),
      outfitDark: std(new THREE.Color(OUTFITS[slot % OUTFITS.length]).multiplyScalar(0.7), { roughness: 0.8 }),
      pants: std(slot % 3 ? '#2b3242' : '#4a5a7a', { roughness: 0.85 }),
      shoe: std(slot % 2 ? '#f2f2f2' : '#1e1e22', { roughness: 0.5 }),
      skin: withRim(std(SKINS[slot % SKINS.length], { roughness: 0.55 }), '#ffd9b8', 0.3),
      hair: std(HAIRS[(slot * 3) % HAIRS.length], { roughness: 0.85 }),
      cap: std(['#e8473f', '#2f6fe8', '#1f1f1f', '#f2c63a'][slot % 4], { roughness: 0.7 }),
      pack: std(['#2fbf8f', '#e8476a', '#3d3d48'][slot % 3], { roughness: 0.6 }),
      deck: std('#2a2d35', { roughness: 0.45, metalness: 0.4 }),
      grip: std('#121214', { roughness: 0.95 }),
      stem: std('#cfd5de', { roughness: 0.25, metalness: 0.85 }),
      accent: std(['#3dffb0', '#9be15d', '#3fb4e8'][slot % 3], { roughness: 0.4, metalness: 0.3 }),
      tire: std('#141416', { roughness: 0.8 }),
      hub: std('#9aa3ad', { roughness: 0.35, metalness: 0.8 }),
      led: glowMat('#ff3b30'),
      head: glowMat('#fff4d6'),
      phone: glowMat('#9fd8ff'),
      white: std('#ffffff'),
      black: std('#111111'),
      beam: new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30').multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    }),
    [slot]
  );
  useEffect(() => {
    runtime.riderSlots = runtime.riderSlots || [];
    runtime.riderSlots[slot] = { root, person, scooter, ring, legs, armPhone };
  }, [slot]);
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
        <mesh position={[0, 0.8, -2.2]} rotation={[-Math.PI / 2 - 0.12, 0, 0]} material={M.beam}>
          <coneGeometry args={[0.8, 3.4, 16, 1, true]} />
        </mesh>
      </group>
      {/* ------------------------------------------------ rider */}
      <group ref={person} position={[0, 0.2, 0.05]}>
        <group ref={legs}>
          {/* front leg slightly bent, back leg braced */}
          <Limb pos={[-0.09, 0.92, -0.02]} rot={[0.12, 0, 0]} len={0.43} r={0.075} material={M.pants}>
            <Limb rot={[-0.2, 0, 0]} len={0.42} r={0.062} material={M.pants}>
              <RoundedBox args={[0.11, 0.08, 0.25]} radius={0.03} position={[0, -0.03, -0.05]} material={M.shoe} castShadow />
            </Limb>
          </Limb>
          <Limb pos={[0.09, 0.92, 0.04]} rot={[-0.22, 0, 0]} len={0.43} r={0.075} material={M.pants}>
            <Limb rot={[0.3, 0, 0]} len={0.42} r={0.062} material={M.pants}>
              <RoundedBox args={[0.11, 0.08, 0.25]} radius={0.03} position={[0, -0.03, -0.05]} material={M.shoe} castShadow />
            </Limb>
          </Limb>
        </group>
        <group position={[0, 0.94, 0]} rotation={[-0.12, 0, 0]}>
          <RoundedBox args={[0.34, 0.16, 0.22]} radius={0.06} position={[0, 0.02, 0]} material={M.pants} />
          <RoundedBox args={[0.4, 0.52, 0.25]} radius={0.1} position={[0, 0.34, 0]} material={M.outfit} castShadow />
          <RoundedBox args={[0.3, 0.12, 0.13]} radius={0.05} position={[0, 0.58, 0.09]} material={M.outfitDark} />
          <mesh position={[0, 0.34, -0.126]} material={M.outfitDark}>
            <boxGeometry args={[0.012, 0.46, 0.005]} />
          </mesh>
          {look.pack && <RoundedBox args={[0.32, 0.4, 0.16]} radius={0.07} position={[0, 0.34, 0.2]} material={M.pack} castShadow />}
          {/* neck + head, tilted down at the phone */}
          <mesh position={[0, 0.63, 0]} material={M.skin}>
            <cylinderGeometry args={[0.05, 0.055, 0.08, 10]} />
          </mesh>
          <group position={[0, 0.66, -0.01]} rotation={[0.3, 0, 0]}>
            <RoundedBox args={[0.21, 0.26, 0.24]} radius={0.09} position={[0, 0.14, 0]} material={M.skin} castShadow />
            {[-0.05, 0.05].map(x => (
              <mesh key={x} position={[x, 0.15, -0.122]} material={M.black}>
                <sphereGeometry args={[0.015, 6, 6]} />
              </mesh>
            ))}
            {[-0.112, 0.112].map(x => (
              <mesh key={x} position={[x, 0.12, 0.01]} material={M.white}>
                <capsuleGeometry args={[0.014, 0.03, 2, 6]} />
              </mesh>
            ))}
            {look.hair === 'cap' && (
              <>
                <RoundedBox args={[0.23, 0.1, 0.25]} radius={0.05} position={[0, 0.27, 0.01]} material={M.cap} />
                <mesh position={[0, 0.235, -0.15]} material={M.cap}>
                  <boxGeometry args={[0.18, 0.02, 0.12]} />
                </mesh>
              </>
            )}
            {look.hair === 'short' && <RoundedBox args={[0.23, 0.09, 0.26]} radius={0.04} position={[0, 0.27, 0.01]} material={M.hair} />}
            {look.hair === 'buzz' && <RoundedBox args={[0.22, 0.05, 0.25]} radius={0.025} position={[0, 0.26, 0.005]} material={M.hair} />}
            {look.hair === 'bun' && (
              <>
                <RoundedBox args={[0.23, 0.09, 0.26]} radius={0.04} position={[0, 0.27, 0.01]} material={M.hair} />
                <mesh position={[0, 0.33, 0.08]} material={M.hair}>
                  <sphereGeometry args={[0.06, 10, 8]} />
                </mesh>
              </>
            )}
            {look.hair === 'long' && (
              <>
                <RoundedBox args={[0.24, 0.1, 0.27]} radius={0.05} position={[0, 0.27, 0.01]} material={M.hair} />
                <RoundedBox args={[0.22, 0.32, 0.06]} radius={0.03} position={[0, 0.08, 0.12]} material={M.hair} />
              </>
            )}
          </group>
          {/* left hand on the bar */}
          <Limb pos={[-0.21, 0.54, 0]} rot={[1.05, 0, 0.18]} len={0.3} r={0.055} material={M.outfit}>
            <Limb rot={[-0.2, 0, -0.1]} len={0.3} r={0.048} material={M.outfit}>
              <mesh material={M.skin}>
                <sphereGeometry args={[0.045, 8, 6]} />
              </mesh>
            </Limb>
          </Limb>
          {/* right hand holding the phone up to the face */}
          <group ref={armPhone} position={[0.21, 0.54, 0]}>
            <Limb rot={[0.55, 0, -0.25]} len={0.29} r={0.055} material={M.outfit}>
              <Limb rot={[1.75, 0, 0.35]} len={0.27} r={0.048} material={M.outfit}>
                <mesh material={M.skin}>
                  <sphereGeometry args={[0.045, 8, 6]} />
                </mesh>
                <mesh position={[0, -0.04, -0.03]} rotation={[0.5, 0, 0]} material={M.black}>
                  <boxGeometry args={[0.08, 0.15, 0.012]} />
                </mesh>
                <mesh position={[0, -0.04, -0.023]} rotation={[0.5, 0, 0]} material={M.phone}>
                  <boxGeometry args={[0.07, 0.135, 0.004]} />
                </mesh>
              </Limb>
            </Limb>
          </group>
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
      sl.person.current.position.set(0, 0.2 + Math.sin(t * 9 + rd.id) * 0.012, 0.05);
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
