import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { on, emit } from '../core/bus';
import { withRim } from './materials';
import { canAssets } from './props';
import { loadPeople, makePerson, attach, bindPosition } from './people';

// The student: a rigged CC0 character playing motion-captured clips,
// dressed in a hoodie, jeans, sneakers, headphones and an oversized
// backpack. Clips are picked from the simulation state every frame.

const OUTFIT = { skin: '#d9a27c', top: '#ff7a3d', bottom: '#3a5a8c', shoes: '#f4f1ea', sole: '#ff4d6d', rim: '#ffe0c0', rimStrength: 0.45 };

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });
const spring = (st, target, k, c, dt) => {
  st.v += (target - st.x) * k * dt - st.v * c * dt;
  st.x += st.v * dt;
  return st.x;
};

// soften a box's corners by pulling vertices toward a rounded shape
function roundOff(geo, r) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const p = geo.attributes.position;
  const half = new THREE.Vector3().subVectors(b.max, b.min).multiplyScalar(0.5);
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(Math.max(-half.x + r, Math.min(half.x - r, v.x)), Math.max(-half.y + r, Math.min(half.y - r, v.y)), Math.max(-half.z + r, Math.min(half.z - r, v.z)));
    const d = v.clone().sub(inner);
    if (d.lengthSq() > 0) v.copy(inner).add(d.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

// gear built once and attached to bones of the rigged body
function buildGear(person) {
  const pack = withRim(mat('#3d6fe0', { roughness: 0.5 }), '#cfe0ff', 0.5);
  const packDark = mat('#2c55b8', { roughness: 0.6 });
  const cup = mat('#ffd23f', { roughness: 0.4 });
  const band = mat('#22252e', { roughness: 0.35, metalness: 0.3 });
  const hood = withRim(mat('#d85f2a', { roughness: 0.8 }), '#ffe0c0', 0.3);
  const c = canAssets();

  // backpack behind the shoulders (source characters face +z, so behind is -z)
  const spine = bindPosition(person, 'spine_03');
  const packGroup = new THREE.Group();
  const shellGeo = new THREE.BoxGeometry(0.4, 0.5, 0.24, 4, 4, 4);
  roundOff(shellGeo, 0.08);
  const shell = new THREE.Mesh(shellGeo, pack);
  shell.castShadow = true;
  packGroup.add(shell);
  const pocketGeo = new THREE.BoxGeometry(0.3, 0.2, 0.08, 3, 3, 3);
  roundOff(pocketGeo, 0.03);
  const pocket = new THREE.Mesh(pocketGeo, packDark);
  pocket.position.set(0, -0.12, -0.14);
  packGroup.add(pocket);
  const bottle = new THREE.Mesh(c.geo, c.body);
  bottle.scale.setScalar(1.3);
  bottle.position.set(0.23, -0.08, 0);
  packGroup.add(bottle);
  for (const x of [-0.12, 0.12]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.03), packDark);
    strap.position.set(x, 0.02, 0.13);
    packGroup.add(strap);
  }
  attach(person, 'spine_03', packGroup, { pos: [0, spine.y - 0.05, spine.z - 0.2] });

  // hood bunched at the back of the neck
  const neck = bindPosition(person, 'neck_01');
  const hoodMesh = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 16, Math.PI * 1.2), hood);
  attach(person, 'spine_03', hoodMesh, { pos: [0, neck.y - 0.02, neck.z - 0.08], rot: [Math.PI / 2 + 0.3, 0, Math.PI * 0.4] });

  // headphones
  const head = bindPosition(person, 'Head');
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 6, 18, Math.PI), band);
  attach(person, 'Head', arc, { pos: [0, head.y + 0.1, head.z] });
  for (const x of [-0.105, 0.105]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 14), cup);
    attach(person, 'Head', ear, { pos: [x, head.y + 0.07, head.z], rot: [0, 0, Math.PI / 2] });
  }

  // the VOLT can that appears in the right hand during a throw
  const hand = bindPosition(person, 'hand_r');
  const inHand = new THREE.Mesh(c.geo, c.body);
  inHand.scale.setScalar(1.4);
  inHand.visible = false;
  attach(person, 'hand_r', inHand, { pos: [hand.x - 0.06, hand.y - 0.02, hand.z + 0.03], rot: [0, 0, Math.PI / 2] });
  return { inHand };
}

export default function Student() {
  const root = useRef();
  const wrap = useRef();
  const stars = useRef();
  const shield = useRef();
  const [person, setPerson] = useState(null);
  const gear = useRef(null);
  const st = useRef({ jumpT: -1, landT: -1, landK: 0, throwT: -1, stumbleT: -1, flipT: -1, death: null, lean: { x: 0, v: 0 }, yaw: 0, stepPhase: 0 });

  useEffect(() => {
    let live = true;
    loadPeople().then(() => {
      if (!live) return;
      const p = makePerson({ sex: 'm', outfit: OUTFIT, hair: 'Hair_SimpleParted', hairColor: '#2a1a12' });
      gear.current = buildGear(p);
      p.play('Sprint_Loop');
      if (import.meta.env.DEV) runtime.debugPerson = p;
      setPerson(p);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const S = st.current;
    const offs = [
      on('jump', () => (S.jumpT = 0)),
      on('doubleJump', () => (S.flipT = 0)),
      on('throw', () => (S.throwT = 0)),
      on('land', e => {
        S.landT = 0;
        S.landK = Math.min(1, (e.impact || 0) / 18);
      }),
      on('stumble', () => (S.stumbleT = 0)),
      on('death', e => (S.death = { cause: e.cause, t: 0, vy: e.cause === 'scooter' ? 6 : 1.5, back: e.cause === 'scooter' ? -8 : 3, y: 0, z: 0 })),
      on('worldReset', () => Object.assign(S, { death: null, jumpT: -1, landT: -1, throwT: -1, stumbleT: -1, flipT: -1 })),
    ];
    return () => offs.forEach(f => f());
  }, []);

  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);

  useFrame((state, rawDt) => {
    const world = runtime.world;
    if (!world || !root.current) return;
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    const r = world.runner;
    const S = st.current;
    runnerLerp(q);
    const h = toWorld(q.s, q.d, q.y, w);
    root.current.position.set(w.x, w.y, w.z);
    const yawT = Math.atan2(-r.vd, Math.max(4, r.speed)) * 0.8;
    S.yaw += (yawT - S.yaw) * Math.min(1, dt * 10);
    root.current.rotation.y = -h + S.yaw;

    const P = person;
    if (P) {
      const run = Math.max(0.85, Math.min(1.45, 0.75 + r.speed * 0.028));
      if (S.death) {
        S.death.t += dt;
        P.play(S.death.cause === 'fall' ? 'Jump_Loop' : 'Death01', { loop: S.death.cause === 'fall', fade: 0.08 });
      } else if (S.flipT >= 0) {
        // double jump: a tucked forward roll in the air
        S.flipT += dt;
        P.play('Roll', { loop: false, timeScale: 1.9, fade: 0.06 });
        if (S.flipT > 0.5 || r.grounded) S.flipT = -1;
      } else if (r.slideT > 0) {
        P.play('Roll', { loop: false, timeScale: 1.6, fade: 0.06 });
      } else if (!r.grounded) {
        if (S.jumpT >= 0 && S.jumpT < 0.22) P.play('Jump_Start', { loop: false, timeScale: 1.8, fade: 0.05 });
        else P.play('Jump_Loop', { fade: 0.12 });
      } else if (S.stumbleT >= 0 && S.stumbleT < 0.45) {
        P.play('Hit_Chest', { loop: false, timeScale: 1.4, fade: 0.06 });
      } else if (S.landT >= 0 && S.landT < 0.16 && S.landK > 0.3) {
        P.play('Jump_Land', { loop: false, timeScale: 2.2, fade: 0.04 });
      } else {
        P.play('Sprint_Loop', { fade: 0.14 });
        P.speed('Sprint_Loop', run);
      }
      // throw on the upper body while the legs keep running
      if (S.throwT >= 0) {
        S.throwT += dt;
        P.play('Punch_Cross', { layer: 'upper', loop: false, timeScale: 1.7, fade: 0.05 });
        gear.current.inHand.visible = S.throwT < 0.16;
        if (S.throwT > 0.38) {
          S.throwT = -1;
          gear.current.inHand.visible = false;
        }
      }
      if (S.jumpT >= 0) S.jumpT += dt;
      if (S.landT >= 0) {
        S.landT += dt;
        if (S.landT > 0.5) S.landT = -1;
      }
      if (S.stumbleT >= 0) {
        S.stumbleT += dt;
        if (S.stumbleT > 0.8) S.stumbleT = -1;
      }
      P.mixer.update(dt);

      // footsteps from the sprint cycle (two per loop)
      if (r.grounded && r.slideT <= 0 && !S.death) {
        const a = P.action('lower', 'Sprint_Loop');
        if (a && a.isRunning()) {
          const ph = (a.time / a.getClip().duration) % 1;
          const prev = S.stepPhase;
          S.stepPhase = ph;
          if ((prev < 0.25 && ph >= 0.25) || (prev < 0.75 && ph >= 0.75)) emit('step', { foot: ph < 0.5 ? -1 : 1 });
        }
      }
    }

    // bank into steering, squash on hard landings, knockback on death
    wrap.current.rotation.z = spring(S.lean, -r.vd * 0.025, 90, 14, dt);
    let squash = 0;
    if (S.landT >= 0 && S.landT < 0.18) squash = Math.sin((S.landT / 0.18) * Math.PI) * (0.04 + S.landK * 0.1);
    wrap.current.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    if (S.death && S.death.cause !== 'fall') {
      const D = S.death;
      D.vy -= 22 * dt;
      D.y = Math.max(0, D.y + D.vy * dt);
      D.z += D.back * dt;
      D.back *= 1 - dt * 2;
      wrap.current.position.set(0, D.y, -D.z);
    } else wrap.current.position.set(0, 0, 0);

    const shaken = r.shakenT > 0 && !r.dead;
    stars.current.visible = shaken;
    if (shaken) stars.current.rotation.y += dt * 6;
    shield.current.visible = world.power.hoodie || r.invT > 0;
    if (shield.current.visible) {
      shield.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 6) * 0.04);
      shield.current.material.opacity = r.invT > 0 ? 0.1 + Math.abs(Math.sin(state.clock.elapsedTime * 20)) * 0.2 : 0.16;
    }
  }, -40);

  const starMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14d').multiplyScalar(2), toneMapped: false }), []);
  const shieldMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fd3ff').multiplyScalar(1.6), transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }), []);

  return (
    <group ref={root}>
      <group ref={wrap}>{person && <primitive object={person.root} />}</group>
      <group ref={stars} position={[0, 2.05, 0]} visible={false}>
        {[0, 1, 2].map(i => (
          <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.26, 0, Math.sin((i / 3) * Math.PI * 2) * 0.26]} material={starMat}>
            <octahedronGeometry args={[0.055, 0]} />
          </mesh>
        ))}
      </group>
      <mesh ref={shield} position={[0, 1, 0]} material={shieldMat} visible={false}>
        <icosahedronGeometry args={[1.1, 2]} />
      </mesh>
      <BlobShadow />
    </group>
  );
}

function BlobShadow() {
  const ref = useRef();
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  useFrame(() => {
    const world = runtime.world;
    if (!world || !ref.current) return;
    const r = world.runner;
    const g = world.surfaces.groundAt(r.s, r.d, r.y + 0.5);
    const o = ref.current;
    if (!g) {
      o.visible = false;
      return;
    }
    o.visible = true;
    const hgt = r.y - g.h;
    o.position.y = g.h - r.y + 0.04;
    const k = Math.max(0.3, 1 - hgt / 6);
    o.scale.setScalar(k);
    o.material.opacity = 0.5 * k;
  }, -39);
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[1.2, 1.2]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.5} />
    </mesh>
  );
}
