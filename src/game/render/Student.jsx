import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { on } from '../core/bus';
import { speedAt } from '../sim/tune';

const SKIN = '#e9b48f';
const HAIR = '#3a2418';
const JEANS = '#3f5f94';
const HOODIE = '#ff7a3d';
const HOODIE_DARK = '#d85f2a';
const PACK = '#3d6fe0';
const PACK_DARK = '#2c55b8';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...opts });

function useMats() {
  return useMemo(
    () => ({
      skin: mat(SKIN),
      hair: mat(HAIR, { roughness: 0.8 }),
      jeans: mat(JEANS, { roughness: 0.85 }),
      hoodie: mat(HOODIE, { roughness: 0.75 }),
      hoodieDark: mat(HOODIE_DARK, { roughness: 0.8 }),
      pack: mat(PACK, { roughness: 0.55 }),
      packDark: mat(PACK_DARK, { roughness: 0.6 }),
      shoe: mat('#f4f1ea', { roughness: 0.5 }),
      sole: mat('#ff4d6d', { roughness: 0.5 }),
      black: mat('#1b1b22', { roughness: 0.4 }),
      phones: mat('#22252e', { roughness: 0.35, metalness: 0.3 }),
      cup: mat('#ffd23f', { roughness: 0.4 }),
      can: mat('#3dffb0', { roughness: 0.3, metalness: 0.6, emissive: new THREE.Color('#1aa070'), emissiveIntensity: 0.4 }),
      white: mat('#ffffff'),
      star: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14d').multiplyScalar(2), toneMapped: false }),
      shield: new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fd3ff').multiplyScalar(1.6), transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
    }),
    []
  );
}

// spring helper
const spring = (st, target, k, c, dt) => {
  st.v += (target - st.x) * k * dt - st.v * c * dt;
  st.x += st.v * dt;
  return st.x;
};

function Limb({ len, r, material, children, innerRef, upperMat }) {
  return (
    <group ref={innerRef}>
      <mesh position={[0, -len / 2, 0]} material={upperMat || material} castShadow>
        <capsuleGeometry args={[r, len - r * 2, 3, 8]} />
      </mesh>
      <group position={[0, -len, 0]}>{children}</group>
    </group>
  );
}

export default function Student() {
  const m = useMats();
  const root = useRef();
  const flip = useRef();
  const hips = useRef();
  const torso = useRef();
  const head = useRef();
  const pack = useRef();
  const legL = useRef();
  const legR = useRef();
  const kneeL = useRef();
  const kneeR = useRef();
  const armL = useRef();
  const armR = useRef();
  const elbowL = useRef();
  const elbowR = useRef();
  const stars = useRef();
  const shield = useRef();
  const canInHand = useRef();

  const st = useRef({
    phase: 0,
    lastS: 0,
    flipT: -1,
    throwT: -1,
    landT: -1,
    landK: 0,
    stumbleT: -1,
    death: null,
    pack: { x: 0, v: 0 },
    packZ: { x: 0, v: 0 },
    lean: { x: 0, v: 0 },
    yaw: 0,
    blink: 0,
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
        st.current.death = { cause: e.cause, t: 0, vx: 0, vy: e.cause === 'scooter' ? 7 : 2, back: e.cause === 'scooter' ? -9 : 4, y: 0, z: 0, rot: 0 };
      }),
      on('worldReset', () => {
        st.current.death = null;
        st.current.flipT = -1;
        st.current.throwT = -1;
        st.current.stumbleT = -1;
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

    // facing: path heading plus a little toward the steering direction
    const yawT = Math.atan2(-r.vd, Math.max(4, r.speed)) * 0.9;
    S.yaw += (yawT - S.yaw) * Math.min(1, dt * 10);
    root.current.rotation.y = -h + S.yaw;

    const speed = r.speed;
    const ds = Math.max(0, q.s - S.lastS);
    S.lastS = q.s;
    const stride = 1.55 + speed * 0.045;
    if (r.grounded && r.slideT <= 0) S.phase += (ds / stride) * Math.PI * 2;
    const ph = S.phase;
    const sp = Math.sin(ph);
    const cp = Math.cos(ph);
    const run = Math.min(1, speed / speedAt(0));

    // Conventions (limbs hang along -y, character faces -z):
    //   leg/arm rotation.x > 0 swings the limb forward; knee rotation.x < 0 bends it;
    //   elbow rotation.x > 0 folds the forearm forward; left arm out = rotation.z < 0.
    //   torsoPitch > 0 leans forward (applied as rotation.x = -torsoPitch).
    let hipY = 0.86 + Math.abs(cp) * 0.07 * run;
    let torsoPitch = 0.16 + Math.min(0.2, (speed - 10) * 0.012);
    let torsoTwist = sp * 0.16;
    let legLx = sp * 0.95;
    let legRx = -sp * 0.95;
    let kneeLx = -(Math.max(0, -Math.cos(ph - 0.4)) * 1.3 + 0.15);
    let kneeRx = -(Math.max(0, Math.cos(ph - 0.4)) * 1.3 + 0.15);
    let armLx = -sp * 0.85;
    let armRx = sp * 0.85;
    let armLz = -0.12;
    let armRz = 0.12;
    let elbowLx = 1.1 + Math.max(0, sp) * 0.3;
    let elbowRx = 1.1 + Math.max(0, -sp) * 0.3;
    let headPitch = torsoPitch * 0.6;

    if (!r.grounded) {
      const rising = r.vy > 0;
      legLx = rising ? 1.1 : 0.5;
      legRx = rising ? -0.2 : 0.2;
      kneeLx = rising ? -1.7 : -1;
      kneeRx = rising ? -0.6 : -0.9;
      armLx = rising ? 2.6 : 1.6;
      armRx = rising ? 2.4 : 1.4;
      armLz = rising ? -0.3 : -0.9;
      armRz = rising ? 0.3 : 0.9;
      elbowLx = 0.4;
      elbowRx = 0.4;
      torsoPitch = rising ? 0.05 : 0.22;
      torsoTwist = 0;
      hipY = 0.86;
      headPitch = 0;
    }
    if (r.slideT > 0) {
      // baseball slide: lean back, legs out front
      hipY = 0.36;
      torsoPitch = -1.05;
      torsoTwist = 0.2;
      legLx = 1.45;
      legRx = 1.2;
      kneeLx = -0.15;
      kneeRx = -0.6;
      armLx = -0.7;
      armLz = -0.9;
      armRx = 1.6;
      armRz = 0.3;
      elbowLx = 0.3;
      elbowRx = 0.6;
      headPitch = -0.85;
    }
    // stumble flail
    if (S.stumbleT >= 0) {
      S.stumbleT += dt;
      const k = Math.max(0, 1 - S.stumbleT / 0.8);
      torsoPitch += 0.5 * k;
      armLx = 1.5 + Math.sin(S.stumbleT * 26) * 1.2 * k;
      armRx = 1.5 + Math.cos(S.stumbleT * 24) * 1.2 * k;
      armLz = -1.1 * k;
      armRz = 1.1 * k;
      if (S.stumbleT > 0.8) S.stumbleT = -1;
    }
    // overhand throw with the right arm: wind up behind the head, snap forward
    if (S.throwT >= 0) {
      S.throwT += dt;
      const t = S.throwT / 0.3;
      const windup = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      armRx = THREE.MathUtils.lerp(-0.4, -3, Math.max(0, windup)) + (t > 0.4 ? (t - 0.4) * 2.6 : 0);
      armRz = 0.25;
      elbowRx = t < 0.4 ? 1.6 : 0.2;
      torsoTwist = t < 0.4 ? 0.45 : -0.35;
      if (canInHand.current) canInHand.current.visible = t < 0.45;
      if (S.throwT > 0.3) {
        S.throwT = -1;
        if (canInHand.current) canInHand.current.visible = false;
      }
    } else if (canInHand.current) canInHand.current.visible = false;

    // landing squash
    let squash = 0;
    if (S.landT >= 0) {
      S.landT += dt;
      squash = Math.sin(Math.min(1, S.landT / 0.18) * Math.PI) * (0.08 + S.landK * 0.16);
      if (S.landT > 0.18) S.landT = -1;
    }

    // death animations override everything
    let deathPitch = 0;
    let deathLift = 0;
    let deathBack = 0;
    if (S.death) {
      const D = S.death;
      D.t += dt;
      if (D.cause === 'scooter') {
        D.vy -= 22 * dt;
        D.y = Math.max(-0.6, D.y + D.vy * dt);
        D.z += D.back * dt;
        D.back *= 1 - dt * 1.5;
        D.rot = Math.min(Math.PI * 1.6, D.rot + dt * 9);
        deathPitch = D.rot;
        deathLift = D.y;
        deathBack = -D.z;
      } else if (D.cause === 'faceplant') {
        const k = Math.min(1, D.t / 0.35);
        deathPitch = -k * 1.45;
        deathLift = -0.55 * k;
        D.z += D.back * dt;
        D.back *= 1 - dt * 3;
        deathBack = -D.z;
      }
      armLx = 2.4 + Math.sin(D.t * 18) * 0.4 * Math.max(0, 1 - D.t);
      armRx = 2.2 + Math.cos(D.t * 16) * 0.4 * Math.max(0, 1 - D.t);
      armLz = -1.2;
      armRz = 1.2;
      legLx = 0.3;
      legRx = -0.2;
    }

    const lerp = (o, key, v, k = 18) => {
      o[key] += (v - o[key]) * Math.min(1, dt * k);
    };
    hips.current.position.y += (hipY - squash * 0.5 - hips.current.position.y) * Math.min(1, dt * 20);
    lerp(torso.current.rotation, 'x', -torsoPitch);
    lerp(torso.current.rotation, 'y', torsoTwist);
    lerp(legL.current.rotation, 'x', legLx, 22);
    lerp(legR.current.rotation, 'x', legRx, 22);
    lerp(kneeL.current.rotation, 'x', kneeLx, 22);
    lerp(kneeR.current.rotation, 'x', kneeRx, 22);
    lerp(armL.current.rotation, 'x', armLx, 20);
    lerp(armR.current.rotation, 'x', armRx, S.throwT >= 0 ? 40 : 20);
    lerp(armL.current.rotation, 'z', armLz);
    lerp(armR.current.rotation, 'z', armRz);
    lerp(elbowL.current.rotation, 'x', elbowLx);
    lerp(elbowR.current.rotation, 'x', elbowRx);
    lerp(head.current.rotation, 'x', headPitch, 10);
    root.current.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

    // banking into turns / steering
    const bank = spring(S.lean, -r.vd * 0.035, 90, 14, dt);
    flip.current.rotation.z = bank;

    // front flip on double jump
    if (S.flipT >= 0) {
      S.flipT += dt;
      const t = Math.min(1, S.flipT / 0.5);
      const e = 1 - Math.pow(1 - t, 2.2);
      flip.current.rotation.x = -e * Math.PI * 2;
      if (t >= 1) {
        S.flipT = -1;
        flip.current.rotation.x = 0;
      }
    } else flip.current.rotation.x = deathPitch;
    flip.current.position.y = 0.9 + deathLift;
    flip.current.position.z = deathBack;

    // backpack: bounces with the stride and lags on jumps
    const bob = Math.abs(cp) * run * (r.grounded ? 1 : 0);
    const packT = (r.grounded ? 0.08 + bob * 0.22 : r.vy > 0 ? -0.35 : 0.45) + squash * 2;
    pack.current.rotation.x = spring(S.pack, packT, 160, 9, dt);
    pack.current.rotation.z = spring(S.packZ, r.vd * 0.03 + sp * 0.05 * run, 120, 8, dt);

    // dizzy stars while shaken, shield bubble with the hoodie power-up
    const shaken = r.shakenT > 0 && !r.dead;
    stars.current.visible = shaken;
    if (shaken) stars.current.rotation.y += dt * 6;
    shield.current.visible = world.power.hoodie || r.invT > 0;
    if (shield.current.visible) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.04;
      shield.current.scale.setScalar(pulse);
      shield.current.material.opacity = r.invT > 0 ? 0.1 + Math.abs(Math.sin(state.clock.elapsedTime * 20)) * 0.2 : 0.16;
    }
  }, -40);

  return (
    <group ref={root}>
      <group ref={flip} position={[0, 0.9, 0]}>
        {/* the flip pivots around the belly; hips hang below it */}
        <group position={[0, -0.9, 0]}>
          <group ref={hips} position={[0, 0.86, 0]}>
            {/* legs */}
            {[
              [legL, kneeL, -0.12],
              [legR, kneeR, 0.12],
            ].map(([leg, knee, x], i) => (
              <group key={i} position={[x, 0, 0]}>
                <Limb innerRef={leg} len={0.42} r={0.095} material={m.jeans}>
                  <Limb innerRef={knee} len={0.4} r={0.085} material={m.jeans}>
                    <mesh position={[0, -0.02, -0.06]} material={m.shoe} castShadow>
                      <boxGeometry args={[0.16, 0.12, 0.3]} />
                    </mesh>
                    <mesh position={[0, -0.075, -0.06]} material={m.sole}>
                      <boxGeometry args={[0.17, 0.04, 0.31]} />
                    </mesh>
                  </Limb>
                </Limb>
              </group>
            ))}
            {/* torso */}
            <group ref={torso}>
              <RoundedBox args={[0.52, 0.58, 0.34]} radius={0.1} position={[0, 0.32, 0]} material={m.hoodie} castShadow />
              <RoundedBox args={[0.32, 0.16, 0.06]} radius={0.03} position={[0, 0.2, -0.17]} material={m.hoodieDark} />
              {/* hood bunched at the back of the neck */}
              <RoundedBox args={[0.38, 0.14, 0.18]} radius={0.06} position={[0, 0.62, 0.12]} material={m.hoodieDark} />
              {[-0.05, 0.05].map(x => (
                <mesh key={x} position={[x, 0.46, -0.18]} material={m.white}>
                  <cylinderGeometry args={[0.012, 0.012, 0.16, 4]} />
                </mesh>
              ))}
              {/* head */}
              <group ref={head} position={[0, 0.66, 0]}>
                <RoundedBox args={[0.46, 0.44, 0.42]} radius={0.16} position={[0, 0.22, 0]} material={m.skin} castShadow />
                <RoundedBox args={[0.5, 0.2, 0.46]} radius={0.09} position={[0, 0.4, 0.03]} material={m.hair} />
                <RoundedBox args={[0.48, 0.3, 0.14]} radius={0.06} position={[0, 0.26, 0.17]} material={m.hair} />
                {[-0.1, 0.1].map(x => (
                  <mesh key={x} position={[x, 0.22, -0.21]} material={m.black}>
                    <capsuleGeometry args={[0.025, 0.05, 2, 6]} />
                  </mesh>
                ))}
                {/* headphones */}
                <mesh position={[0, 0.3, 0]} rotation={[0, 0, 0]} material={m.phones}>
                  <torusGeometry args={[0.26, 0.025, 6, 16, Math.PI]} />
                </mesh>
                {[-0.26, 0.26].map(x => (
                  <mesh key={x} position={[x, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={m.cup}>
                    <cylinderGeometry args={[0.09, 0.09, 0.07, 12]} />
                  </mesh>
                ))}
                {/* dizzy stars */}
                <group ref={stars} position={[0, 0.62, 0]} visible={false}>
                  {[0, 1, 2].map(i => (
                    <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.32, 0, Math.sin((i / 3) * Math.PI * 2) * 0.32]} material={m.star}>
                      <octahedronGeometry args={[0.06, 0]} />
                    </mesh>
                  ))}
                </group>
              </group>
              {/* arms */}
              {[
                [armL, elbowL, -0.31, false],
                [armR, elbowR, 0.31, true],
              ].map(([arm, elbow, x, right], i) => (
                <group key={i} position={[x, 0.54, 0]}>
                  <Limb innerRef={arm} len={0.3} r={0.075} material={m.hoodie}>
                    <Limb innerRef={elbow} len={0.27} r={0.07} material={m.hoodie}>
                      <mesh material={m.skin} castShadow>
                        <sphereGeometry args={[0.075, 10, 8]} />
                      </mesh>
                      {right && (
                        <mesh ref={canInHand} position={[0, -0.06, 0]} material={m.can} visible={false}>
                          <cylinderGeometry args={[0.055, 0.055, 0.17, 10]} />
                        </mesh>
                      )}
                    </Limb>
                  </Limb>
                </group>
              ))}
              {/* the backpack, hinged at the shoulders */}
              <group ref={pack} position={[0, 0.58, 0.16]}>
                <RoundedBox args={[0.58, 0.68, 0.38]} radius={0.12} position={[0, -0.3, 0.2]} material={m.pack} castShadow />
                <RoundedBox args={[0.44, 0.3, 0.12]} radius={0.05} position={[0, -0.44, 0.4]} material={m.packDark} />
                <RoundedBox args={[0.5, 0.08, 0.1]} radius={0.03} position={[0, 0.02, 0.16]} material={m.packDark} />
                {/* energy drink in the side pocket */}
                <mesh position={[0.31, -0.42, 0.22]} material={m.can}>
                  <cylinderGeometry args={[0.055, 0.055, 0.17, 10]} />
                </mesh>
                {/* keychain */}
                <mesh position={[-0.2, -0.62, 0.42]} material={m.cup}>
                  <octahedronGeometry args={[0.04, 0]} />
                </mesh>
                {[-0.17, 0.17].map(x => (
                  <mesh key={x} position={[x, -0.1, -0.02]} material={m.packDark}>
                    <boxGeometry args={[0.06, 0.5, 0.05]} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
      <mesh ref={shield} position={[0, 0.95, 0]} material={m.shield} visible={false}>
        <icosahedronGeometry args={[1.05, 2]} />
      </mesh>
      <BlobShadow />
    </group>
  );
}

// soft contact shadow that stays on the ground under the student
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
      <planeGeometry args={[1.3, 1.3]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.5} />
    </mesh>
  );
}
