import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// per-frame scratch
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lead = new THREE.Vector3();
import { runtime } from '../core/runtime';
import { on } from '../core/bus';
import { SKY } from './Atmosphere';
import { shared } from './materials';
import { useOriginShift, shiftVec } from './origin';

// A living sky: soft cumulus clouds, airliners with contrails, a banner
// plane, V-formations of geese, hot-air balloons, shooting stars at night.
// Everything lives in a ring around the camera so it never falls behind.

const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ clouds
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 128 + (Math.random() - 0.5) * 120;
    const y = 140 + (Math.random() - 0.5) * 60 - Math.abs(x - 128) * 0.25;
    const r = 30 + Math.random() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Clouds({ count = 90 }) {
  const ref = useRef();
  const { geo, mat, data } = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const offs = new Float32Array(count * 3);
    const sizes = new Float32Array(count * 2);
    const shade = new Float32Array(count);
    const data = [];
    // clusters of 4-6 puffs, spread in a ring
    let i = 0;
    while (i < count) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(260, 520);
      const y = rand(70, 170);
      const n = Math.min(count - i, 4 + Math.floor(Math.random() * 3));
      const big = rand(60, 120);
      for (let k = 0; k < n; k++, i++) {
        data.push({ a, r, y, ox: rand(-big * 0.7, big * 0.7), oy: rand(-big * 0.12, big * 0.18), drift: rand(0.4, 1.4) });
        sizes[i * 2] = big * rand(0.6, 1.1);
        sizes[i * 2 + 1] = big * rand(0.42, 0.65);
        shade[i] = Math.random();
      }
    }
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offs, 3));
    geo.setAttribute('size', new THREE.InstancedBufferAttribute(sizes, 2));
    geo.setAttribute('shade', new THREE.InstancedBufferAttribute(shade, 1));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { tMap: { value: cloudTexture() }, uLit: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 offset; attribute vec2 size; attribute float shade;
        varying vec2 vUv; varying float vShade;
        void main() {
          vUv = uv; vShade = shade;
          vec4 mv = modelViewMatrix * vec4(offset, 1.0);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec3 uLit; uniform vec3 uShadow; uniform float uAlpha;
        varying vec2 vUv; varying float vShade;
        void main() {
          vec4 t = texture2D(tMap, vUv);
          vec3 col = mix(uShadow, uLit, smoothstep(0.15, 0.85, vUv.y) * 0.8 + vShade * 0.2);
          gl_FragColor = vec4(col, t.a * uAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo, mat, data };
  }, [count]);
  useFrame(({ camera }, dt) => {
    const offs = geo.attributes.offset.array;
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      c.a += dt * 0.004 * c.drift;
      offs[i * 3] = camera.position.x + Math.cos(c.a) * c.r + c.ox * Math.sin(c.a);
      offs[i * 3 + 1] = camera.position.y * 0.3 + c.y + c.oy;
      offs[i * 3 + 2] = camera.position.z + Math.sin(c.a) * c.r - c.ox * Math.cos(c.a);
    }
    geo.attributes.offset.needsUpdate = true;
    mat.uniforms.uLit.value.copy(SKY.cloudTop).lerp(SKY.sun, 0.25);
    mat.uniforms.uShadow.value.copy(SKY.cloudShadow).lerp(SKY.horizon, 0.3);
    mat.uniforms.uAlpha.value = 0.95 - SKY.night * 0.35;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={-5} />;
}

// --------------------------------------------------------------- airliners
function Airliner() {
  const group = useRef();
  const trail = useRef();
  const blink = useRef();
  const st = useRef({ t: 30, dur: 40, from: new THREE.Vector3(), dir: new THREE.Vector3(), active: false });
  useOriginShift(e => shiftVec(st.current.from, e));
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.4, metalness: 0.3 }),
      trail: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3030').multiplyScalar(3), toneMapped: false }),
    }),
    []
  );
  useFrame(({ camera }, dt) => {
    const S = st.current;
    S.t += dt;
    if (!S.active && S.t > 25) {
      // start a crossing high overhead
      S.active = true;
      S.t = 0;
      S.dur = rand(30, 45);
      const a = Math.random() * Math.PI * 2;
      S.dir.set(Math.cos(a + Math.PI), 0, Math.sin(a + Math.PI));
      S.from.set(camera.position.x + Math.cos(a) * 500, rand(190, 240), camera.position.z + Math.sin(a) * 500);
    }
    const g = group.current;
    g.visible = S.active;
    if (!S.active) return;
    const k = S.t / S.dur;
    if (k > 1) {
      S.active = false;
      S.t = 0;
      return;
    }
    g.position.copy(S.from).addScaledVector(S.dir, k * 1000);
    g.position.x += camera.position.x * 0.0;
    g.rotation.y = Math.atan2(-S.dir.x, -S.dir.z);
    // contrail grows behind and fades
    const len = Math.min(220, S.t * 22);
    trail.current.scale.set(1, 1, len);
    trail.current.position.z = len / 2 + 4;
    mats.trail.opacity = 0.5 * (1 - SKY.night * 0.7);
    blink.current.visible = Math.sin(shared.uTime.value * 6) > 0.6;
  });
  return (
    <group ref={group} visible={false}>
      <mesh material={mats.body} scale={2.2}>
        <capsuleGeometry args={[0.7, 6, 4, 8]} />
      </mesh>
      <mesh material={mats.body} rotation={[Math.PI / 2, 0, 0]} scale={2.2}>
        <boxGeometry args={[9, 1.6, 0.15]} />
      </mesh>
      <mesh material={mats.body} position={[0, 2.4, 6.4]} scale={2.2}>
        <boxGeometry args={[0.15, 2, 1.2]} />
      </mesh>
      <mesh ref={blink} material={mats.red} position={[0, -1.6, 0]}>
        <sphereGeometry args={[0.6, 6, 4]} />
      </mesh>
      <group ref={trail}>
        {[-5, 5].map(x => (
          <mesh key={x} material={mats.trail} position={[x, 0, 0]}>
            <boxGeometry args={[1.2, 1.2, 1]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ------------------------------------------------------------ banner plane
const BANNERS = ['FREE PIZZA @ THE STUDENT UNION', 'FINALS WEEK: STAY HYDRATED', 'GO GOLD! GAME DAY SATURDAY', 'SCOOTERS ≠ SIDEWALKS', 'DRINK VOLT. RUN FASTER.'];
function bannerTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#c8102e';
  g.font = '900 72px Arial Black, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 512, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function BannerPlane() {
  const group = useRef();
  const banner = useRef();
  const st = useRef({ t: 8, active: false, from: new THREE.Vector3(), dir: new THREE.Vector3(), i: 0 });
  useOriginShift(e => shiftVec(st.current.from, e));
  const textures = useMemo(() => BANNERS.map(bannerTexture), []);
  // Upload every banner up front. The material starts with a map so swapping
  // banners never changes its shader: adding the first map 45 s into a run
  // used to recompile it and upload the texture mid-run (a ~180 ms freeze).
  const { gl } = useThree();
  useEffect(() => textures.forEach(t => gl.initTexture(t)), [gl, textures]);
  const mats = useMemo(
    () => ({
      plane: new THREE.MeshStandardMaterial({ color: '#d63a2f', roughness: 0.5 }),
      white: new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 }),
      banner: new THREE.MeshBasicMaterial({ map: textures[0], side: THREE.DoubleSide, fog: false, transparent: true }),
      rope: new THREE.MeshBasicMaterial({ color: '#444' }),
    }),
    []
  );
  useFrame(({ camera }, dt) => {
    const S = st.current;
    S.t += dt;
    if (!S.active && S.t > 45 && runtime.mode === 'play' && SKY.night < 0.7) {
      S.active = true;
      S.t = 0;
      S.i = (S.i + 1) % textures.length;
      mats.banner.map = textures[S.i];
      // fly across ahead of the camera, left to right or right to left
      const fwd = camera.getWorldDirection(_fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = _right.set(-fwd.z, 0, fwd.x);
      const side = Math.random() < 0.5 ? -1 : 1;
      S.from.copy(camera.position).addScaledVector(fwd, rand(140, 200)).addScaledVector(right, side * 260);
      S.from.y = camera.position.y + rand(45, 65);
      S.dir.copy(right).multiplyScalar(-side);
    }
    const g = group.current;
    g.visible = S.active;
    if (!S.active) return;
    const k = S.t / 26;
    if (k > 1) {
      S.active = false;
      S.t = 0;
      return;
    }
    g.position.copy(S.from).addScaledVector(S.dir, k * 520);
    g.rotation.y = Math.atan2(-S.dir.x, -S.dir.z);
    banner.current.rotation.x = Math.sin(shared.uTime.value * 4) * 0.05;
  });
  return (
    <group ref={group} visible={false}>
      <mesh material={mats.plane}>
        <capsuleGeometry args={[0.6, 3.4, 4, 8]} />
      </mesh>
      <mesh material={mats.white} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[7.5, 1.1, 0.12]} />
      </mesh>
      <mesh material={mats.white} position={[0, 0.9, 2.2]}>
        <boxGeometry args={[0.12, 1.4, 0.8]} />
      </mesh>
      <mesh material={mats.rope} position={[0, 0, 7]}>
        <boxGeometry args={[0.04, 0.04, 9]} />
      </mesh>
      <mesh ref={banner} material={mats.banner} position={[0, -0.4, 22]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[22, 2.8]} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------- geese in V
function Flocks({ birds = 42 }) {
  const ref = useRef();
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // body diamond + two wing triangles; wing tips flap in the shader
    const p = [0, 0, -0.9, 0.25, 0, 0, 0, 0, 0.9, 0, 0, -0.9, 0, 0, 0.9, -0.25, 0, 0, 0, 0, -0.3, 2.2, 0, 0.2, 0, 0, 0.5, 0, 0, -0.3, 0, 0, 0.5, -2.2, 0, 0.2];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: '#2a2622', side: THREE.DoubleSide, fog: false });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = shared.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ph = float(gl_InstanceID) * 1.7;\ntransformed.y += sin(uTime * 7.0 + ph) * abs(position.x) * 0.55;');
    };
    return { geo: g, mat: m };
  }, []);
  const st = useRef({ t: 12, active: false, from: new THREE.Vector3(), dir: new THREE.Vector3(), n: 9 });
  useOriginShift(e => shiftVec(st.current.from, e));
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ camera }, dt) => {
    const S = st.current;
    const mesh = ref.current;
    S.t += dt;
    if (!S.active && S.t > 18) {
      S.active = true;
      S.t = 0;
      S.n = 7 + Math.floor(Math.random() * 6);
      const a = Math.random() * Math.PI * 2;
      S.dir.set(Math.cos(a + Math.PI + rand(-0.5, 0.5)), 0, Math.sin(a + Math.PI + rand(-0.5, 0.5))).normalize();
      S.from.set(camera.position.x + Math.cos(a) * 220, camera.position.y + rand(35, 70), camera.position.z + Math.sin(a) * 220);
    }
    if (!S.active) {
      mesh.count = 0;
      return;
    }
    const k = S.t / 22;
    if (k > 1) {
      S.active = false;
      S.t = 0;
      return;
    }
    const lead = _lead.copy(S.from).addScaledVector(S.dir, k * 440);
    const right = _right.set(-S.dir.z, 0, S.dir.x);
    const yaw = Math.atan2(-S.dir.x, -S.dir.z);
    let i = 0;
    for (let b = 0; b < S.n && i < birds; b++, i++) {
      const row = Math.ceil(b / 2);
      const side = b === 0 ? 0 : b % 2 ? 1 : -1;
      tmp.position.copy(lead).addScaledVector(S.dir, -row * 3.2).addScaledVector(right, side * row * 3);
      tmp.position.y += Math.sin(shared.uTime.value + b) * 0.4;
      tmp.rotation.set(0, yaw, 0);
      tmp.scale.setScalar(0.9);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, birds]} frustumCulled={false} />;
}

// -------------------------------------------------------- hot-air balloons
function Balloons() {
  const group = useRef();
  const balloons = useMemo(
    () =>
      [0, 1, 2].map(i => {
        const g = new THREE.SphereGeometry(6, 16, 12);
        const cols = [];
        const stripes = [['#d4a82a', '#1d1d20'], ['#c8102e', '#f4f1ea'], ['#3f8fe8', '#f2c63a']][i];
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const a = Math.atan2(pos.getZ(v), pos.getX(v));
          const c = new THREE.Color(stripes[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2]);
          cols.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        g.scale(1, 1.25, 1);
        return { geo: g, a: (i / 3) * Math.PI * 2 + 0.7, r: 330 + i * 40, y: 60 + i * 18 };
      }),
    []
  );
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), []);
  const basket = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 }), []);
  useFrame(({ camera }, dt) => {
    group.current.children.forEach((c, i) => {
      const b = balloons[i];
      b.a += dt * 0.006;
      c.position.set(camera.position.x + Math.cos(b.a) * b.r, camera.position.y * 0.3 + b.y + Math.sin(shared.uTime.value * 0.3 + i) * 3, camera.position.z + Math.sin(b.a) * b.r);
    });
  });
  return (
    <group ref={group}>
      {balloons.map((b, i) => (
        <group key={i}>
          <mesh geometry={b.geo} material={mat} />
          <mesh material={basket} position={[0, -9.5, 0]}>
            <boxGeometry args={[1.6, 1.4, 1.6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------- shooting stars
function ShootingStars() {
  const ref = useRef();
  const st = useRef({ t: 0, active: false, from: new THREE.Vector3(), dir: new THREE.Vector3() });
  useOriginShift(e => shiftVec(st.current.from, e));
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(3), transparent: true, depthWrite: false, fog: false, toneMapped: false }), []);
  useFrame(({ camera }, dt) => {
    const S = st.current;
    const m = ref.current;
    S.t += dt;
    if (!S.active && SKY.night > 0.6 && S.t > 6 && Math.random() < dt * 0.25) {
      S.active = true;
      S.t = 0;
      const a = Math.random() * Math.PI * 2;
      S.from.set(camera.position.x + Math.cos(a) * 300, camera.position.y + rand(140, 220), camera.position.z + Math.sin(a) * 300);
      S.dir.set(rand(-1, 1), -0.35, rand(-1, 1)).normalize();
    }
    m.visible = S.active;
    if (!S.active) return;
    const k = S.t / 0.9;
    if (k > 1) {
      S.active = false;
      S.t = 0;
      return;
    }
    m.position.copy(S.from).addScaledVector(S.dir, k * 160);
    m.lookAt(_lead.copy(m.position).add(S.dir));
    mat.opacity = Math.sin(k * Math.PI);
  });
  return (
    <mesh ref={ref} material={mat} visible={false}>
      <boxGeometry args={[0.5, 0.5, 26]} />
    </mesh>
  );
}

// fireworks when you beat your record (big glowing bursts above campus)
function Fireworks() {
  const ref = useRef();
  const COUNT = 600;
  const { geo, mat, P } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, sizeAttenuation: true });
    const P = Array.from({ length: COUNT }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }));
    return { geo, mat, P };
  }, []);
  useOriginShift(e => P.forEach(p => shiftVec(p.p, e)));
  useEffect(
    () =>
      on('passedBest', () => {
        const cam = runtime.camera;
        if (!cam) return;
        const fwd = new THREE.Vector3();
        cam.getWorldDirection(fwd);
        let idx = 0;
        for (let b = 0; b < 4; b++) {
          const center = cam.position.clone().addScaledVector(fwd, rand(70, 110)).add(new THREE.Vector3(rand(-40, 40), rand(35, 60), rand(-40, 40)));
          const col = new THREE.Color(['#ffd23f', '#ff4d6d', '#3dffb0', '#6fb4ff'][b]).multiplyScalar(3);
          for (let k = 0; k < COUNT / 4; k++, idx++) {
            const p = P[idx];
            p.life = 1.6 + b * 0.25;
            p.p.copy(center);
            p.v.randomDirection().multiplyScalar(rand(14, 22));
            p.c.copy(col);
            p.delay = b * 0.35;
          }
        }
      }),
    [P]
  );
  useFrame((_, dt) => {
    if (!P.some(p => p.life > 0)) return;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    for (let i = 0; i < COUNT; i++) {
      const p = P[i];
      if (p.life <= 0) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.life -= dt;
      p.v.multiplyScalar(1 - dt * 1.2);
      p.v.y -= 6 * dt;
      p.p.addScaledVector(p.v, dt);
      pos[i * 3] = p.p.x;
      pos[i * 3 + 1] = p.p.y;
      pos[i * 3 + 2] = p.p.z;
      const f = Math.min(1, p.life);
      col[i * 3] = p.c.r * f;
      col[i * 3 + 1] = p.c.g * f;
      col[i * 3 + 2] = p.c.b * f;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

export default function SkyLife({ tier }) {
  return (
    <>
      <Clouds count={tier === 'low' ? 50 : 90} />
      <Airliner />
      <BannerPlane />
      <Flocks />
      <Balloons />
      <ShootingStars />
      <Fireworks />
    </>
  );
}
