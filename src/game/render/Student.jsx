import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { on, emit } from '../core/bus';
import { withRim } from './materials';
import { canAssets } from './props';

// The student: athletic proportions, oversized backpack, procedural
// animation driven by the simulation.
//
// Rig conventions (limbs hang along -y, the character faces -z):
//   thigh / upper arm rotation.x > 0 swings the limb forward
//   knee rotation.x < 0 bends it; elbow rotation.x > 0 folds the forearm up
//   ankle rotation.x > 0 lifts the toes; left arm out = rotation.z < 0

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });

function useMats() {
  return useMemo(
    () => ({
      skin: withRim(mat('#d9a27c', { roughness: 0.55 }), '#ffd9b8', 0.35),
      hair: withRim(mat('#2a1a12', { roughness: 0.7 }), '#ffcf9a', 0.5),
      jeans: withRim(mat('#3a5a8c', { roughness: 0.85 }), '#bcd4ff', 0.35),
      jeansDark: mat('#2e4a76', { roughness: 0.9 }),
      hoodie: withRim(mat('#ff7a3d', { roughness: 0.78 }), '#ffe0c0', 0.45),
      hoodieDark: mat('#d85f2a', { roughness: 0.8 }),
      pack: withRim(mat('#3d6fe0', { roughness: 0.5 }), '#cfe0ff', 0.5),
      packDark: mat('#2c55b8', { roughness: 0.6 }),
      shoe: mat('#f4f1ea', { roughness: 0.45 }),
      sole: mat('#ff4d6d', { roughness: 0.5 }),
      black: mat('#18181d', { roughness: 0.4 }),
      phones: mat('#22252e', { roughness: 0.35, metalness: 0.3 }),
      cup: mat('#ffd23f', { roughness: 0.4 }),
      can: mat('#3dffb0', { roughness: 0.3, metalness: 0.6, emissive: new THREE.Color('#1aa070'), emissiveIntensity: 0.4 }),
      white: mat('#ffffff', { roughness: 0.3 }),
      mouth: mat('#7a3a30'),
      star: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14d').multiplyScalar(2), toneMapped: false }),
      shield: new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fd3ff').multiplyScalar(1.6), transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
    }),
    []
  );
}

const spring = (st, target, k, c, dt) => {
  st.v += (target - st.x) * k * dt - st.v * c * dt;
  st.x += st.v * dt;
  return st.x;
};
const smooth = x => x * x * (3 - 2 * x);

// a limb segment hanging from its joint, with a child joint at its end
function Seg({ len, r, r2 = r, material, innerRef, children }) {
  return (
    <group ref={innerRef}>
      <mesh position={[0, -len / 2, 0]} material={material} castShadow>
        <cylinderGeometry args={[r, r2, len, 10]} />
      </mesh>
      <mesh material={material}>
        <sphereGeometry args={[r * 1.02, 10, 8]} />
      </mesh>
      <group position={[0, -len, 0]}>{children}</group>
    </group>
  );
}

const HIP = 0.98; // hip height when standing
const THIGH = 0.46;
const SHIN = 0.45;

export default function Student() {
  const m = useMats();
  const root = useRef();
  const flip = useRef();
  const pelvis = useRef();
  const torso = useRef();
  const head = useRef();
  const pack = useRef();
  const L = { thigh: useRef(), knee: useRef(), ankle: useRef(), arm: useRef(), elbow: useRef() };
  const R = { thigh: useRef(), knee: useRef(), ankle: useRef(), arm: useRef(), elbow: useRef() };
  const stars = useRef();
  const shield = useRef();
  const canInHand = useRef();

  const st = useRef({
    phase: 0,
    flipT: -1,
    throwT: -1,
    landT: -1,
    landK: 0,
    stumbleT: -1,
    death: null,
    pack: { x: 0, v: 0 },
    packZ: { x: 0, v: 0 },
    lean: { x: 0, v: 0 },
    bob: { x: 0, v: 0 },
    yaw: 0,
    airPose: 0,
  });

  useEffect(() => {
    const offs = [
      on('doubleJump', () => (st.current.flipT = 0)),
      on('throw', () => (st.current.throwT = 0)),
      on('land', e => {
        st.current.landT = 0;
        st.current.landK = Math.min(1, (e.impact || 0) / 18);
      }),
      on('stumble', () => (st.current.stumbleT = 0)),
      on('death', e => {
        st.current.death = { cause: e.cause, t: 0, vy: e.cause === 'scooter' ? 7 : 2, back: e.cause === 'scooter' ? -9 : 4, y: 0, z: 0, rot: 0 };
      }),
      on('worldReset', () => {
        Object.assign(st.current, { death: null, flipT: -1, throwT: -1, stumbleT: -1 });
      }),
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

    // face the path, turned slightly toward where you're steering
    const yawT = Math.atan2(-r.vd, Math.max(4, r.speed)) * 0.8;
    S.yaw += (yawT - S.yaw) * Math.min(1, dt * 10);
    root.current.rotation.y = -h + S.yaw;

    // ------------------------------------------------------------ run cycle
    // cadence rises with speed (strides per second, one stride = two steps)
    const speed = r.speed;
    const cadence = 1.25 + speed * 0.045;
    const running = r.grounded && r.slideT <= 0 && !S.death;
    if (running) {
      const before = S.phase;
      S.phase = (S.phase + dt * cadence) % 1;
      // a footfall each half stride
      if ((before < 0.25 && S.phase >= 0.25) || (before < 0.75 && S.phase >= 0.75)) emit('step', { foot: S.phase < 0.5 ? -1 : 1 });
    }
    const p = S.phase * Math.PI * 2;
    const intensity = Math.min(1, 0.55 + speed / 30);

    const leg = off => {
      const a = p + off;
      const s = Math.sin(a);
      // thigh: forward bias, big forward drive, shorter extension behind
      const thigh = 0.22 + (s > 0 ? 0.95 : 0.55) * s * intensity;
      // heel kick: knee folds hard while the leg swings through
      const swing = Math.max(0, Math.cos(a - 0.35));
      const knee = -(0.22 + 1.95 * Math.pow(swing, 1.6) * intensity);
      // foot: level at strike, toes down at push-off
      const ankle = -(thigh + knee) * 0.55 - Math.max(0, -s) * 0.35;
      return { thigh, knee, ankle };
    };
    let lp = leg(0);
    let rp = leg(Math.PI);
    // arms counter-swing with ~90° elbows that open a little at the back
    const armSwing = Math.sin(p) * 0.85 * intensity;
    let pose = {
      hipY: HIP - 0.06 - (1 - Math.abs(Math.sin(p))) * 0.07 * intensity,
      lean: 0.2 + Math.min(0.18, speed * 0.008),
      twist: Math.sin(p) * 0.22,
      pelvisTwist: -Math.sin(p) * 0.16,
      sway: Math.sin(p) * 0.03,
      lT: lp.thigh,
      lK: lp.knee,
      lA: lp.ankle,
      rT: rp.thigh,
      rK: rp.knee,
      rA: rp.ankle,
      lArm: -armSwing + 0.15,
      rArm: armSwing + 0.15,
      lArmZ: -0.14,
      rArmZ: 0.14,
      lElbow: 1.45 - Math.max(0, -armSwing) * 0.35,
      rElbow: 1.45 - Math.max(0, armSwing) * 0.35,
      head: 0,
    };

    if (!r.grounded && !S.death) {
      // airborne: one knee driven up, other leg trailing, arms balancing
      const rising = r.vy > 0;
      S.airPose = Math.min(1, S.airPose + dt * 8);
      const k = smooth(S.airPose);
      const lerpP = (key, v) => (pose[key] = pose[key] + (v - pose[key]) * k);
      lerpP('lT', rising ? 1.25 : 0.7);
      lerpP('lK', rising ? -1.9 : -1.1);
      lerpP('rT', rising ? -0.35 : 0.15);
      lerpP('rK', rising ? -1.2 : -0.7);
      lerpP('lA', 0.2);
      lerpP('rA', -0.2);
      lerpP('lArm', rising ? -0.6 : 0.4);
      lerpP('rArm', rising ? 1.4 : 0.9);
      lerpP('lArmZ', -0.55);
      lerpP('rArmZ', 0.4);
      lerpP('lElbow', 0.9);
      lerpP('rElbow', 1.1);
      lerpP('lean', rising ? 0.1 : 0.25);
      lerpP('twist', 0);
      pose.hipY = HIP;
    } else S.airPose = Math.max(0, S.airPose - dt * 10);

    if (r.slideT > 0 && !S.death) {
      // baseball slide: hips low, lean back, lead leg out, trailing leg tucked
      Object.assign(pose, {
        hipY: 0.42,
        lean: -1.0,
        twist: 0.25,
        pelvisTwist: 0,
        lT: 1.45,
        lK: -0.12,
        lA: 0.3,
        rT: 0.9,
        rK: -1.6,
        rA: 0,
        lArm: -0.7,
        lArmZ: -0.7,
        lElbow: 0.3,
        rArm: 1.4,
        rArmZ: 0.3,
        rElbow: 0.9,
        head: -0.75,
      });
    }

    if (S.stumbleT >= 0) {
      S.stumbleT += dt;
      const k = Math.max(0, 1 - S.stumbleT / 0.8);
      pose.lean += 0.55 * k;
      pose.lArm = 1.4 + Math.sin(S.stumbleT * 26) * 1.1 * k;
      pose.rArm = 1.4 + Math.cos(S.stumbleT * 24) * 1.1 * k;
      pose.lArmZ = -1.1 * k;
      pose.rArmZ = 1.1 * k;
      if (S.stumbleT > 0.8) S.stumbleT = -1;
    }

    // overhand throw: wind up behind the head, snap through
    let throwFast = false;
    if (S.throwT >= 0) {
      S.throwT += dt;
      const t = S.throwT / 0.3;
      const windup = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      pose.rArm = THREE.MathUtils.lerp(-0.3, -2.9, Math.max(0, windup)) + (t > 0.4 ? (t - 0.4) * 2.6 : 0);
      pose.rArmZ = 0.3;
      pose.rElbow = t < 0.4 ? 1.7 : 0.25;
      pose.twist = t < 0.4 ? 0.5 : -0.4;
      throwFast = true;
      if (canInHand.current) canInHand.current.visible = t < 0.45;
      if (S.throwT > 0.3) S.throwT = -1;
    }
    if (S.throwT < 0 && canInHand.current) canInHand.current.visible = false;

    let squash = 0;
    if (S.landT >= 0) {
      S.landT += dt;
      squash = Math.sin(Math.min(1, S.landT / 0.18) * Math.PI) * (0.06 + S.landK * 0.14);
      if (S.landT > 0.18) S.landT = -1;
    }

    // death animations
    let deathPitch = 0;
    let deathLift = 0;
    let deathBack = 0;
    if (S.death) {
      const D = S.death;
      D.t += dt;
      if (D.cause === 'scooter') {
        D.vy -= 22 * dt;
        D.y = Math.max(-0.7, D.y + D.vy * dt);
        D.z += D.back * dt;
        D.back *= 1 - dt * 1.5;
        D.rot = Math.min(Math.PI * 1.55, D.rot + dt * 9);
        deathPitch = D.rot;
        deathLift = D.y;
        deathBack = -D.z;
      } else if (D.cause === 'faceplant') {
        const k = Math.min(1, D.t / 0.35);
        deathPitch = -k * 1.45;
        deathLift = -0.62 * k;
        D.z += D.back * dt;
        D.back *= 1 - dt * 3;
        deathBack = -D.z;
      }
      const wob = Math.max(0, 1 - D.t);
      Object.assign(pose, {
        lArm: 2.4 + Math.sin(D.t * 18) * 0.4 * wob,
        rArm: 2.2 + Math.cos(D.t * 16) * 0.4 * wob,
        lArmZ: -1.2,
        rArmZ: 1.2,
        lElbow: 0.3,
        rElbow: 0.3,
        lT: 0.4,
        rT: -0.25,
        lK: -0.6,
        rK: -0.3,
      });
    }

    // ---------------------------------------------------------- apply pose
    const k = Math.min(1, dt * 22);
    const set = (obj, axis, v, kk = k) => {
      obj.rotation[axis] += (v - obj.rotation[axis]) * kk;
    };
    const bob = spring(S.bob, pose.hipY - squash * 0.6, 260, 22, dt);
    pelvis.current.position.y = bob;
    set(pelvis.current, 'y', pose.pelvisTwist, k);
    set(pelvis.current, 'z', pose.sway, k);
    set(torso.current, 'x', -pose.lean, Math.min(1, dt * 12));
    set(torso.current, 'y', pose.twist - pose.pelvisTwist, throwFast ? Math.min(1, dt * 30) : k);
    set(head.current, 'x', pose.lean * 0.65 + pose.head, Math.min(1, dt * 10));
    set(head.current, 'y', -pose.twist * 0.8, k);
    set(L.thigh.current, 'x', pose.lT);
    set(L.knee.current, 'x', pose.lK);
    set(L.ankle.current, 'x', pose.lA);
    set(R.thigh.current, 'x', pose.rT);
    set(R.knee.current, 'x', pose.rK);
    set(R.ankle.current, 'x', pose.rA);
    set(L.arm.current, 'x', pose.lArm);
    set(R.arm.current, 'x', pose.rArm, throwFast ? Math.min(1, dt * 40) : k);
    set(L.arm.current, 'z', pose.lArmZ);
    set(R.arm.current, 'z', pose.rArmZ);
    set(L.elbow.current, 'x', pose.lElbow);
    set(R.elbow.current, 'x', pose.rElbow, throwFast ? Math.min(1, dt * 40) : k);
    root.current.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);

    // bank into steering
    flip.current.rotation.z = spring(S.lean, -r.vd * 0.03, 90, 14, dt);
    if (S.flipT >= 0) {
      S.flipT += dt;
      const t = Math.min(1, S.flipT / 0.5);
      flip.current.rotation.x = -(1 - Math.pow(1 - t, 2.2)) * Math.PI * 2;
      if (t >= 1) {
        S.flipT = -1;
        flip.current.rotation.x = 0;
      }
    } else flip.current.rotation.x = deathPitch;
    flip.current.position.y = 0.95 + deathLift;
    flip.current.position.z = deathBack;

    // backpack bounces on every footfall and lags on jumps
    const step = Math.abs(Math.cos(p));
    const packT = r.grounded ? 0.06 + step * 0.14 * intensity : r.vy > 0 ? -0.3 : 0.4;
    pack.current.rotation.x = spring(S.pack, packT + squash * 2, 170, 10, dt);
    pack.current.rotation.z = spring(S.packZ, r.vd * 0.025 + Math.sin(p) * 0.06, 120, 8, dt);

    const shaken = r.shakenT > 0 && !r.dead;
    stars.current.visible = shaken;
    if (shaken) stars.current.rotation.y += dt * 6;
    shield.current.visible = world.power.hoodie || r.invT > 0;
    if (shield.current.visible) {
      shield.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 6) * 0.04);
      shield.current.material.opacity = r.invT > 0 ? 0.1 + Math.abs(Math.sin(state.clock.elapsedTime * 20)) * 0.2 : 0.16;
    }
  }, -40);

  const legJSX = (side, refs) => (
    <group position={[side * 0.105, -0.04, 0]}>
      <Seg innerRef={refs.thigh} len={THIGH} r={0.085} r2={0.07} material={m.jeans}>
        <Seg innerRef={refs.knee} len={SHIN} r={0.068} r2={0.055} material={m.jeans}>
          <group ref={refs.ankle}>
            <mesh position={[0, -0.02, 0]} material={m.jeansDark}>
              <cylinderGeometry args={[0.062, 0.062, 0.05, 10]} />
            </mesh>
            <RoundedBox args={[0.12, 0.09, 0.27]} radius={0.04} position={[0, -0.06, -0.06]} material={m.shoe} castShadow />
            <RoundedBox args={[0.13, 0.035, 0.28]} radius={0.015} position={[0, -0.105, -0.06]} material={m.sole} />
          </group>
        </Seg>
      </Seg>
    </group>
  );

  const armJSX = (side, refs, right) => (
    <group position={[side * 0.25, 0.56, 0.01]}>
      <Seg innerRef={refs.arm} len={0.29} r={0.062} r2={0.055} material={m.hoodie}>
        <Seg innerRef={refs.elbow} len={0.26} r={0.052} r2={0.045} material={m.hoodie}>
          <mesh position={[0, -0.03, 0]} material={m.skin} castShadow>
            <sphereGeometry args={[0.052, 10, 8]} />
          </mesh>
          {right && (
            <group ref={canInHand} position={[0, -0.07, -0.02]} scale={1.3} visible={false}>
              <mesh geometry={canAssets().geo} material={canAssets().body} />
            </group>
          )}
        </Seg>
      </Seg>
    </group>
  );

  return (
    <group ref={root}>
      <group ref={flip} position={[0, 0.95, 0]}>
        <group position={[0, -0.95, 0]}>
          <group ref={pelvis} position={[0, HIP, 0]}>
            <RoundedBox args={[0.34, 0.18, 0.22]} radius={0.06} position={[0, -0.02, 0]} material={m.jeans} castShadow />
            {legJSX(-1, L)}
            {legJSX(1, R)}
            <group ref={torso}>
              {/* hoodie: belly, chest, shoulders */}
              <RoundedBox args={[0.36, 0.3, 0.23]} radius={0.08} position={[0, 0.18, 0]} material={m.hoodie} castShadow />
              <RoundedBox args={[0.44, 0.32, 0.26]} radius={0.1} position={[0, 0.44, 0]} material={m.hoodie} castShadow />
              <RoundedBox args={[0.26, 0.12, 0.05]} radius={0.03} position={[0, 0.17, -0.11]} material={m.hoodieDark} />
              <RoundedBox args={[0.3, 0.12, 0.14]} radius={0.05} position={[0, 0.62, 0.08]} material={m.hoodieDark} />
              {[-0.045, 0.045].map(x => (
                <mesh key={x} position={[x, 0.46, -0.135]} material={m.white}>
                  <cylinderGeometry args={[0.009, 0.009, 0.14, 4]} />
                </mesh>
              ))}
              {/* neck + head */}
              <mesh position={[0, 0.66, 0]} material={m.skin}>
                <cylinderGeometry args={[0.055, 0.06, 0.1, 10]} />
              </mesh>
              <group ref={head} position={[0, 0.7, 0]}>
                <RoundedBox args={[0.24, 0.29, 0.27]} radius={0.1} position={[0, 0.15, -0.01]} material={m.skin} castShadow />
                <RoundedBox args={[0.26, 0.11, 0.29]} radius={0.05} position={[0, 0.28, 0.01]} material={m.hair} />
                <RoundedBox args={[0.25, 0.2, 0.08]} radius={0.04} position={[0, 0.2, 0.12]} material={m.hair} />
                {[-0.056, 0.056].map(x => (
                  <group key={x} position={[x, 0.165, -0.138]}>
                    <mesh scale={[1, 1.15, 0.5]} material={m.white}>
                      <sphereGeometry args={[0.026, 10, 8]} />
                    </mesh>
                    <mesh position={[0, -0.002, -0.011]} material={m.black}>
                      <sphereGeometry args={[0.014, 8, 6]} />
                    </mesh>
                    <mesh position={[0, 0.045, 0.002]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]} material={m.hair}>
                      <boxGeometry args={[0.05, 0.013, 0.012]} />
                    </mesh>
                  </group>
                ))}
                <mesh position={[0, 0.125, -0.15]} scale={[0.8, 1, 1]} material={m.skin}>
                  <sphereGeometry args={[0.022, 8, 6]} />
                </mesh>
                <mesh position={[0, 0.075, -0.135]} material={m.mouth}>
                  <boxGeometry args={[0.045, 0.01, 0.01]} />
                </mesh>
                {[-0.125, 0.125].map(x => (
                  <mesh key={x} position={[x, 0.15, 0.01]} scale={[0.5, 1, 0.8]} material={m.skin}>
                    <sphereGeometry args={[0.035, 8, 6]} />
                  </mesh>
                ))}
                {/* messy hair tufts */}
                {[
                  [-0.07, 0.32, -0.08, 0.5],
                  [0.0, 0.335, -0.1, 0.25],
                  [0.07, 0.32, -0.07, -0.4],
                  [0.04, 0.33, 0.04, -0.2],
                ].map(([x, y, z, r], i) => (
                  <RoundedBox key={i} args={[0.09, 0.06, 0.11]} radius={0.025} position={[x, y, z]} rotation={[-0.4, 0, r]} material={m.hair} />
                ))}
                {/* headphones */}
                <mesh position={[0, 0.2, 0.0]} material={m.phones}>
                  <torusGeometry args={[0.145, 0.016, 6, 16, Math.PI]} />
                </mesh>
                {[-0.135, 0.135].map(x => (
                  <mesh key={x} position={[x, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} material={m.cup}>
                    <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
                  </mesh>
                ))}
                <group ref={stars} position={[0, 0.42, 0]} visible={false}>
                  {[0, 1, 2].map(i => (
                    <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.24, 0, Math.sin((i / 3) * Math.PI * 2) * 0.24]} material={m.star}>
                      <octahedronGeometry args={[0.05, 0]} />
                    </mesh>
                  ))}
                </group>
              </group>
              {armJSX(-1, L, false)}
              {armJSX(1, R, true)}
              {/* oversized backpack, hinged at the shoulders */}
              <group ref={pack} position={[0, 0.58, 0.13]}>
                <RoundedBox args={[0.46, 0.58, 0.28]} radius={0.1} position={[0, -0.27, 0.15]} material={m.pack} castShadow />
                <RoundedBox args={[0.36, 0.24, 0.09]} radius={0.04} position={[0, -0.39, 0.3]} material={m.packDark} />
                <RoundedBox args={[0.4, 0.07, 0.08]} radius={0.03} position={[0, 0.0, 0.1]} material={m.packDark} />
                <mesh position={[0.25, -0.36, 0.16]} scale={1.3} geometry={canAssets().geo} material={canAssets().body} />
                <mesh position={[-0.16, -0.55, 0.33]} material={m.cup}>
                  <octahedronGeometry args={[0.035, 0]} />
                </mesh>
                {[-0.14, 0.14].map(x => (
                  <mesh key={x} position={[x, -0.12, -0.02]} material={m.packDark}>
                    <boxGeometry args={[0.05, 0.42, 0.04]} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
      <mesh ref={shield} position={[0, 1, 0]} material={m.shield} visible={false}>
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
