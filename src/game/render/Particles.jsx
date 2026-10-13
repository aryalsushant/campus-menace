import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, toWorld } from '../core/runtime';
import { on } from '../core/bus';

// One pooled point cloud for every burst in the game.
const MAX = 900;

const vert = /* glsl */ `
  attribute float size; attribute vec3 color; attribute float alpha;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = color; vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.15, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

const PRESETS = {
  dust: { n: 10, color: ['#e8dcc8', '#cdbfa8'], size: [0.25, 0.5], speed: [1, 3], up: [0.5, 2], life: [0.4, 0.8], grav: -1, drag: 3 },
  leaves: { n: 8, color: ['#4f9a3e', '#7fb35a', '#e3842f'], size: [0.15, 0.28], speed: [2, 4], up: [1, 3], life: [0.6, 1], grav: 6, drag: 2 },
  sparks: { n: 10, color: ['#ffd27a', '#ff9a3a'], size: [0.08, 0.16], speed: [3, 7], up: [1, 4], life: [0.25, 0.5], grav: 14, drag: 1, glow: 2 },
  fizz: { n: 34, color: ['#3dffb0', '#b8ffe6', '#ffffff'], size: [0.14, 0.36], speed: [2, 7], up: [1, 5], life: [0.4, 0.9], grav: 6, drag: 2, glow: 1.8 },
  pizza: { n: 7, color: ['#ffd23f', '#ffb02e', '#ffffff'], size: [0.12, 0.24], speed: [1, 3], up: [1, 3], life: [0.3, 0.5], grav: 2, drag: 3, glow: 1.8 },
  confetti: { n: 46, color: ['#ff5a8a', '#ffd23f', '#3dffb0', '#6fb4ff', '#c08cf0'], size: [0.14, 0.26], speed: [3, 8], up: [4, 9], life: [0.8, 1.4], grav: 12, drag: 1.4, glow: 1.4 },
  splash: { n: 40, color: ['#bfe8ff', '#ffffff', '#6fc0e0'], size: [0.2, 0.45], speed: [1, 5], up: [4, 10], life: [0.6, 1.1], grav: 18, drag: 1 },
  restock: { n: 26, color: ['#3dffb0', '#ffffff'], size: [0.14, 0.28], speed: [1, 2], up: [2, 5], life: [0.5, 0.9], grav: 2, drag: 2, glow: 2 },
  power: { n: 30, color: ['#ffffff', '#ffe14d'], size: [0.18, 0.34], speed: [2, 5], up: [1, 4], life: [0.4, 0.8], grav: 0, drag: 3, glow: 2 },
  bounce: { n: 30, color: ['#3dffb0', '#ffffff'], size: [0.2, 0.4], speed: [2, 6], up: [2, 6], life: [0.4, 0.7], grav: 10, drag: 2, glow: 2 },
  crumble: { n: 16, color: ['#a07a52', '#7a5a3a'], size: [0.15, 0.3], speed: [0.5, 2], up: [0, 1], life: [0.6, 1], grav: 14, drag: 1 },
};

export default function Particles() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, toneMapped: false }), []);
  const pool = useRef(
    Array.from({ length: MAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, size: 0, r: 1, g: 1, b: 1 }))
  );
  const cursor = useRef(0);
  const idle = useRef(false);

  useEffect(() => {
    const c = new THREE.Color();
    const rnd = (a, b) => a + Math.random() * (b - a);
    const burst = (kind, s, d, y, mult = 1) => {
      const P = PRESETS[kind];
      if (!P || !runtime.world) return;
      const w = {};
      toWorld(s, d, y, w);
      const n = Math.round(P.n * mult);
      for (let i = 0; i < n; i++) {
        const p = pool.current[cursor.current];
        cursor.current = (cursor.current + 1) % MAX;
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(...P.speed);
        p.x = w.x + rnd(-0.15, 0.15);
        p.y = w.y + rnd(0, 0.2);
        p.z = w.z + rnd(-0.15, 0.15);
        p.vx = Math.cos(a) * sp;
        p.vz = Math.sin(a) * sp;
        p.vy = rnd(...P.up);
        p.life = p.max = rnd(...P.life);
        p.grav = P.grav;
        p.drag = P.drag;
        p.size = rnd(...P.size);
        c.set(P.color[Math.floor(Math.random() * P.color.length)]).multiplyScalar(P.glow || 1);
        p.r = c.r;
        p.g = c.g;
        p.b = c.b;
      }
    };
    const R = () => runtime.world.runner;
    const offs = [
      on('land', e => burst('dust', e.s, e.d, e.y, Math.min(2, 0.5 + (e.impact || 0) / 12))),
      on('slide', e => burst('dust', e.s, e.d, R().y, 1.2)),
      on('jump', e => burst('dust', e.s, e.d, e.y, 0.5)),
      on('doubleJump', e => burst('power', e.s, e.d, e.y + 0.5, 0.5)),
      on('scrape', e => burst(runtime.world.stage === 0 ? 'leaves' : 'sparks', e.s, e.d + e.side * 0.3, R().y + 0.6)),
      on('canHit', e => burst('fizz', e.s, e.d, e.y)),
      on('canMiss', e => burst('fizz', e.s, e.d, e.y + 0.1, 0.35)),
      on('pizza', e => burst('pizza', e.s, e.d, e.y)),
      on('comboBonus', () => burst('confetti', R().s + 2, R().d, R().y + 1.5)),
      on('takedown', e => burst('confetti', e.s, e.d, R().y + 1.2, 0.5)),
      on('restock', () => burst('restock', R().s, R().d, R().y + 1)),
      on('powerup', e => burst('power', e.s, e.d, e.y)),
      on('golden', e => burst('confetti', e.s, e.d, e.y, 0.6)),
      on('passedBest', () => burst('confetti', R().s + 3, R().d, R().y + 2, 1.4)),
      on('bounce', e => burst('bounce', e.s, e.d, e.y)),
      on('stumble', () => burst('dust', R().s, R().d, R().y, 1.6)),
      on('crumble', () => burst('crumble', R().s, R().d, R().y)),
      on('shieldBreak', () => burst('power', R().s, R().d, R().y + 1, 1.4)),
      on('death', e => {
        const r = R();
        if (e.cause === 'fall' && runtime.world.stage === 0) burst('splash', r.s, r.d, r.y + 1);
        else burst('dust', r.s, r.d, r.y, 2.5);
      }),
      on('worldReset', () => pool.current.forEach(p => (p.life = 0))),
    ];
    return () => offs.forEach(f => f());
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const size = geo.attributes.size.array;
    const alpha = geo.attributes.alpha.array;
    const P = pool.current;
    // nothing alive: skip the buffer work entirely
    if (!pool.current.some(p => p.life > 0)) {
      if (!idle.current) {
        alpha.fill(0);
        geo.attributes.alpha.needsUpdate = true;
        idle.current = true;
      }
      return;
    }
    idle.current = false;
    for (let i = 0; i < MAX; i++) {
      const p = P[i];
      if (p.life <= 0) {
        alpha[i] = 0;
        continue;
      }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
      size[i] = p.size;
      alpha[i] = Math.max(0, p.life / p.max);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
