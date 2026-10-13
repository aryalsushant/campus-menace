import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const _fwd = new THREE.Vector3();
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { shared } from './materials';
import { sectionHeight } from './campus';
import { SKY } from './Atmosphere';

// Grass blades on the lawns, drifting autumn leaves and night fireflies.
// Everything is recycled around the player, so the cost is constant.

const SPAN = 70; // metres of lawn kept populated ahead of the player (grass beyond is hidden by distance anyway)

function bladeGeometry() {
  // a tapered blade: two triangles, tip colour lighter than the base
  const g = new THREE.BufferGeometry();
  const p = [-0.045, 0, 0, 0.045, 0, 0, -0.022, 0.22, 0, 0.022, 0.22, 0, 0, 0.38, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('h', new THREE.Float32BufferAttribute([0, 0, 0.58, 0.58, 1], 1));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  g.computeVertexNormals();
  return g;
}

function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float h;\nuniform float uTime;\nvarying float vH;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vH = h;
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float wave = sin(uTime * 1.9 + ip.x * 0.35 + ip.z * 0.27) * 0.5 + sin(uTime * 3.1 + ip.x * 0.9) * 0.2;
        transformed.x += wave * 0.16 * h * h;
        transformed.z += wave * 0.08 * h * h;`
      )
      // grass normals point up so blades light like the lawn, not like cards
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.25, vH);');
  };
  return m;
}

export function Grass({ count }) {
  const ref = useRef();
  const geo = useMemo(bladeGeometry, []);
  const mat = useMemo(grassMaterial, []);
  const blades = useMemo(() => {
    const rnd = Math.random;
    return Array.from({ length: count }, () => ({ u: rnd(), side: rnd() < 0.5 ? -1 : 1, off: rnd(), rot: rnd() * Math.PI, sc: 0.7 + rnd() * 0.7, base: -1, shade: rnd() }));
  }, [count]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  const heights = useMemo(() => new Map(), []);

  useFrame(() => {
    const world = runtime.world;
    const mesh = ref.current;
    if (!world || !mesh) return;
    runnerLerp(q);
    const start = Math.floor((q.s - 12) / SPAN) * SPAN;
    let dirty = false;
    let colorsDirty = false;
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      // which window does this blade belong to: keep it within [q.s - 12, q.s - 12 + SPAN)
      let s = start + b.u * SPAN;
      if (s < q.s - 12) s += SPAN;
      const base = s;
      if (b.base === base) continue;
      b.base = base;
      dirty = true;
      const seg = world.segments.find(g => g.kind === 'section' && s >= g.s0 && s <= g.s1);
      if (!seg || seg.stage === 1) {
        tmp.position.set(0, -9999, 0);
        tmp.scale.setScalar(0);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        continue;
      }
      let H = heights.get(seg.id);
      if (!H) heights.set(seg.id, (H = sectionHeight(seg)));
      const inner = seg.w + 1.25;
      const outerD = seg.stage === 0 ? seg.w + 16 : seg.w + 8;
      // bias blades toward the path where the camera looks
      const d = b.side * (inner + Math.pow(b.off, 1.6) * (outerD - inner));
      toWorld(s, d, H(s) - 0.03, w);
      tmp.position.set(w.x, w.y, w.z);
      tmp.rotation.set(0, b.rot, 0);
      tmp.scale.set(b.sc, b.sc * (0.8 + b.shade * 0.6), b.sc);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      col.set(seg.stage === 2 ? '#7cc858' : '#5c9e38').offsetHSL((b.shade - 0.5) * 0.06, 0, (b.shade - 0.5) * 0.12);
      mesh.setColorAt(i, col);
      colorsDirty = true;
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
    if (colorsDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (heights.size > 30) heights.clear();
  });

  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} receiveShadow />;
}

// autumn leaves drifting through the air near the camera (main campus only)
export function Leaves({ count = 90 }) {
  const ref = useRef();
  const geo = useMemo(() => new THREE.PlaneGeometry(0.16, 0.12), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), []);
  const leaves = useMemo(
    () => Array.from({ length: count }, () => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), r: new THREE.Euler(), age: 99 })),
    [count]
  );
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const palette = useMemo(() => ['#e3842f', '#d2552c', '#e8b63a', '#c9472f', '#f0a23b', '#9a6a2a'].map(c => new THREE.Color(c)), []);
  useFrame(({ camera }, rawDt) => {
    const mesh = ref.current;
    const world = runtime.world;
    if (!mesh || !world) return;
    const dt = Math.min(rawDt, 0.05);
    const on = world.stage === 0;
    mesh.visible = on;
    if (!on) return;
    const fwd = camera.getWorldDirection(_fwd);
    for (let i = 0; i < leaves.length; i++) {
      const L = leaves[i];
      L.age += dt;
      if (L.age > 7 || L.p.y < camera.position.y - 6) {
        // respawn in a box in front of the camera, above head height
        L.p.copy(camera.position).addScaledVector(fwd, 6 + Math.random() * 34);
        L.p.x += (Math.random() - 0.5) * 26;
        L.p.z += (Math.random() - 0.5) * 26;
        L.p.y = camera.position.y + 2 + Math.random() * 6;
        L.v.set((Math.random() - 0.5) * 1.2, -0.6 - Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
        L.age = 0;
        mesh.setColorAt(i, palette[i % palette.length]);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      const t = shared.uTime.value;
      L.p.x += (L.v.x + Math.sin(t * 1.3 + i) * 0.7) * dt;
      L.p.y += L.v.y * dt;
      L.p.z += (L.v.z + Math.cos(t * 1.1 + i) * 0.7) * dt;
      L.r.x += L.spin.x * dt;
      L.r.y += L.spin.y * dt;
      L.r.z += L.spin.z * dt;
      tmp.position.copy(L.p);
      tmp.rotation.copy(L.r);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}

// glowing fireflies around the path once night falls
export function Fireflies({ count = 120 }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('phase', new THREE.BufferAttribute(Float32Array.from({ length: count }, () => Math.random() * 6.28), 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared.uTime, uOn: { value: 0 } },
        vertexShader: `attribute float phase; uniform float uTime; varying float vA;
          void main(){ vec3 p = position; p.y += sin(uTime * 1.3 + phase) * 0.4; p.x += cos(uTime * 0.7 + phase) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = 0.5 + 0.5 * sin(uTime * 3.0 + phase * 3.0);
          gl_PointSize = 9.0 * (40.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uOn; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uOn; gl_FragColor = vec4(vec3(1.0, 0.9, 0.45) * 2.2, a); }`,
      }),
    []
  );
  const seeded = useRef(-1);
  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  useFrame(() => {
    const world = runtime.world;
    if (!world || !ref.current) return;
    mat.uniforms.uOn.value = Math.max(0, (SKY.night - 0.3) / 0.7);
    if (mat.uniforms.uOn.value <= 0) return;
    runnerLerp(q);
    const block = Math.floor(q.s / 60);
    if (block === seeded.current) return;
    seeded.current = block;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = q.s - 10 + Math.random() * 130;
      const side = Math.random() < 0.5 ? -1 : 1;
      toWorld(s, side * (4 + Math.random() * 12), q.y + 0.4 + Math.random() * 2.2, w);
      pos[i * 3] = w.x;
      pos[i * 3 + 1] = w.y;
      pos[i * 3 + 2] = w.z;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}
