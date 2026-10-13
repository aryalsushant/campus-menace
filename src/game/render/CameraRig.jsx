import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { on } from '../core/bus';
import { speedAt } from '../sim/tune';

// Heading-up follow camera: always behind the student along the path, so
// forward is up the screen (like heading-up mode in a maps app).
const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CameraRig() {
  const { camera, size } = useThree();
  const st = useRef({ init: false, y: 0, d: 0, shake: 0, fov: 62, deadT: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() });
  const q = useMemo(() => ({}), []);
  const a = useMemo(() => ({}), []);
  const b = useMemo(() => ({}), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const kick = k => () => (st.current.shake = Math.max(st.current.shake, k));
    const offs = [
      on('stumble', kick(0.35)),
      on('death', kick(0.6)),
      on('canHit', kick(0.16)),
      on('takedown', kick(0.18)),
      on('bonk', kick(0.3)),
      on('shieldBreak', kick(0.3)),
      on('land', e => (st.current.shake = Math.max(st.current.shake, Math.min(0.25, (e.impact || 0) / 60)))),
      on('worldReset', () => (st.current.init = false)),
    ];
    return () => offs.forEach(f => f());
  }, []);

  useFrame((_, rawDt) => {
    const world = runtime.world;
    runtime.camera = camera;
    if (!world) return;
    const dt = Math.min(rawDt, 0.05);
    const S = st.current;
    const r = world.runner;
    runnerLerp(q);
    const portrait = size.width / size.height < 0.8;
    const back = portrait ? 8.4 : 7.2;
    const height = portrait ? 4.4 : 3.5;

    if (!S.init) {
      S.y = q.y;
      S.d = q.d;
    }
    // vertical follow is softer than lateral so jumps don't jerk the view;
    // while falling to your death the camera stays up and watches
    const groundY = r.grounded ? q.y : Math.max(r.groundH, q.y);
    const targetY = r.dead && r.cause === 'fall' ? S.y : r.grounded ? q.y : Math.min(groundY + 1.2, q.y);
    S.y += (targetY - S.y) * Math.min(1, dt * (r.grounded ? 6 : 2.5));
    S.d += (q.d * 0.6 - S.d) * Math.min(1, dt * 6);

    const camS = r.dead && r.cause === 'fall' ? q.s - back * 1.4 : q.s - back;
    toWorld(camS, S.d, S.y + height, a);
    toWorld(q.s + 11, q.d * 0.75, S.y + 1.1, b);
    if (r.dead && r.cause === 'fall') {
      toWorld(q.s, q.d, q.y, b);
    }
    tmp.set(a.x, a.y, a.z);
    if (!S.init) {
      S.pos.copy(tmp);
      S.look.set(b.x, b.y, b.z);
      S.init = true;
    }
    S.pos.lerp(tmp, Math.min(1, dt * 9));
    S.look.lerp(tmp.set(b.x, b.y, b.z), Math.min(1, dt * 10));

    camera.position.copy(S.pos);
    if (S.shake > 0 && !reduceMotion) {
      const k = S.shake * S.shake;
      camera.position.x += (Math.random() - 0.5) * k * 1.2;
      camera.position.y += (Math.random() - 0.5) * k * 1.2;
      S.shake = Math.max(0, S.shake - dt * 1.6);
    }
    camera.lookAt(S.look);

    // FOV widens with speed, sprint and cold brew
    const base = portrait ? 74 : 62;
    const over = Math.max(0, r.speed - speedAt(r.s));
    const fovT = base + (r.speed - 10) * 0.42 + over * 0.9 + (world.power.coffee > 0 ? 5 : 0);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
  }, -30);
  return null;
}
