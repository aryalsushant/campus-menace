import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { timeOfDayAt } from '../sim/tune';
import { shared } from './materials';
import { useOriginShift } from './origin';

// Three keyframes: morning → sunset → night. Everything (sky, fog, lights,
// clouds, window glow) is blended from the same timeline.
const KEYS = [
  {
    zenith: '#3f7fd0', mid: '#8fc3ee', horizon: '#ffe6c4', sun: '#fff3d6', fog: '#d6e6f0',
    sunDir: [0.42, 0.62, 0.66], sunColor: '#fff0d8', sunI: 2.7, hemiSky: '#d6ecff', hemiGround: '#8a7a5a', hemiI: 1.05,
    cloudTop: '#ffffff', cloudShadow: '#b6c8e0', night: 0, stars: 0,
  },
  {
    zenith: '#2b2a6b', mid: '#8a5cb3', horizon: '#ffb38a', sun: '#fff1c9', fog: '#e9a3a0',
    sunDir: [-0.5, 0.3, -0.8], sunColor: '#ffcf9a', sunI: 2.4, hemiSky: '#c9b8ff', hemiGround: '#6b4a3a', hemiI: 0.95,
    cloudTop: '#ffd9c2', cloudShadow: '#9a6fb4', night: 0.35, stars: 0.2,
  },
  {
    zenith: '#05081f', mid: '#141a4a', horizon: '#3b2768', sun: '#bcd0ff', fog: '#1d1840',
    sunDir: [0.3, 0.55, -0.6], sunColor: '#9fb4ff', sunI: 0.9, hemiSky: '#5a6ad8', hemiGround: '#2a1a3a', hemiI: 0.7,
    cloudTop: '#5a5a9a', cloudShadow: '#1f1a40', night: 1, stars: 1,
  },
].map(k => {
  const out = { ...k };
  for (const key of ['zenith', 'mid', 'horizon', 'sun', 'fog', 'sunColor', 'hemiSky', 'hemiGround', 'cloudTop', 'cloudShadow']) out[key] = new THREE.Color(k[key]);
  out.sunDir = new THREE.Vector3(...k.sunDir).normalize();
  return out;
});

// live blended palette
export const SKY = {
  zenith: new THREE.Color(),
  mid: new THREE.Color(),
  horizon: new THREE.Color(),
  sun: new THREE.Color(),
  fog: new THREE.Color(),
  sunColor: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  cloudTop: new THREE.Color(),
  cloudShadow: new THREE.Color(),
  sunDir: new THREE.Vector3(),
  sunI: 1,
  hemiI: 1,
  night: 0,
  stars: 0,
  tod: 0,
};

function blend(tod) {
  const i = Math.min(1, Math.floor(tod));
  const t = THREE.MathUtils.smoothstep(tod - i, 0, 1);
  const a = KEYS[i];
  const b = KEYS[i + 1];
  for (const key of ['zenith', 'mid', 'horizon', 'sun', 'fog', 'sunColor', 'hemiSky', 'hemiGround', 'cloudTop', 'cloudShadow']) SKY[key].copy(a[key]).lerp(b[key], t);
  SKY.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  SKY.sunI = a.sunI + (b.sunI - a.sunI) * t;
  SKY.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  SKY.night = a.night + (b.night - a.night) * t;
  SKY.stars = a.stars + (b.stars - a.stars) * t;
  SKY.tod = tod;
}
blend(0);

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun;
  uniform vec3 uSunDir; uniform float uTime; uniform float uStars; uniform float uNight;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, h));
    col = mix(col, uZenith, smoothstep(0.24, 0.9, h));
    col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.3, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    float disc = mix(900.0, 2400.0, uNight);
    col += uSun * pow(s, disc) * mix(6.0, 3.0, uNight);
    col += uSun * pow(s, 60.0) * mix(0.5, 0.25, uNight);
    col += vec3(1.0, 0.55, 0.35) * pow(s, 6.0) * 0.3 * (1.0 - uNight);
    vec3 g = floor(d * 240.0);
    float st = step(0.9962, hash(g));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash(g + 3.0) * 40.0);
    col += st * tw * smoothstep(0.08, 0.6, h) * uStars;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: SKY.zenith },
          uMid: { value: SKY.mid },
          uHorizon: { value: SKY.horizon },
          uSun: { value: SKY.sun },
          uSunDir: { value: SKY.sunDir },
          uTime: shared.uTime,
          uStars: { value: 0 },
          uNight: { value: 0 },
        },
      }),
    []
  );
  const ref = useRef();
  useFrame(({ camera }) => {
    mat.uniforms.uStars.value = SKY.stars;
    mat.uniforms.uNight.value = SKY.night;
    ref.current.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[600, 48, 24]} />
    </mesh>
  );
}

const cloudFrag = /* glsl */ `
  uniform float uTime; uniform vec3 uTop; uniform vec3 uShadow; uniform vec3 uHorizon; uniform vec3 uSunDir;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
               mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)), dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
  void main() {
    vec2 p = vWorld.xz * 0.012;
    float t = uTime * 0.01;
    float n = fbm(p + vec2(t, t * 0.6));
    float n2 = fbm(p * 2.2 - vec2(t * 1.7, 0.0) + n);
    float c = smoothstep(-0.25, 0.55, n + n2 * 0.5);
    float nl = fbm(p + uSunDir.xz * 0.06 + vec2(t, t * 0.6));
    float lit = clamp((n - nl) * 4.0 + 0.6, 0.0, 1.0);
    vec3 col = mix(uShadow, uTop, c * 0.7 + lit * 0.3);
    col = mix(col, uHorizon, 0.15);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function CloudSea() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          uniform vec3 uOrigin;
          #include <fog_pars_vertex>
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz + uOrigin;
            vec4 mvPosition = viewMatrix * wp;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: cloudFrag,
        fog: true,
        uniforms: {
          ...THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            { uTime: { value: 0 }, uTop: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() } },
          ]),
          uOrigin: shared.uOrigin,
        },
      }),
    []
  );
  const ref = useRef();
  useFrame(({ camera }) => {
    const u = mat.uniforms;
    u.uTime.value = shared.uTime.value;
    u.uTop.value.copy(SKY.cloudTop);
    u.uShadow.value.copy(SKY.cloudShadow);
    u.uHorizon.value.copy(SKY.horizon);
    u.uSunDir.value.copy(SKY.sunDir);
    ref.current.position.x = Math.round(camera.position.x / 40) * 40;
    ref.current.position.z = Math.round(camera.position.z / 40) * 40;
    ref.current.position.y = camera.position.y - 70;
  });
  return (
    <mesh ref={ref} material={mat} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1400, 1400, 1, 1]} />
    </mesh>
  );
}

function Lights({ shadows, shadowSize }) {
  const sun = useRef();
  const hemi = useRef();
  const { scene } = useThree();
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    scene.add(target);
    return () => scene.remove(target);
  }, [scene, target]);
  const q = useMemo(() => ({}), []);
  const wpos = useMemo(() => ({}), []);
  const frame = useRef(0);
  const shifted = useRef(false);
  useOriginShift(() => (shifted.current = true));
  useFrame(() => {
    const L = sun.current;
    if (!L || !runtime.world) return;
    // phones refresh the shadow map every other frame (the sun moves with you, so it isn't noticeable)
    frame.current++;
    if (L.shadow) {
      L.shadow.autoUpdate = shadowSize >= 2048;
      // always redraw right after the scene re-centres
      if (!L.shadow.autoUpdate) L.shadow.needsUpdate = frame.current % 2 === 0 || shifted.current;
      shifted.current = false;
    }
    runnerLerp(q);
    toWorld(q.s + 10, 0, q.y, wpos);
    const snap = 0.5;
    const x = Math.round(wpos.x / snap) * snap;
    const z = Math.round(wpos.z / snap) * snap;
    L.position.set(x + SKY.sunDir.x * 70, wpos.y + SKY.sunDir.y * 70 + 6, z + SKY.sunDir.z * 70);
    target.position.set(x, wpos.y, z);
    L.target = target;
    L.color.copy(SKY.sunColor);
    L.intensity = SKY.sunI;
    hemi.current.color.copy(SKY.hemiSky);
    hemi.current.groundColor.copy(SKY.hemiGround);
    hemi.current.intensity = SKY.hemiI;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#888888', 1]} />
      <FillLight />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-intensity={0.38}
        shadow-radius={4}
        shadow-blurSamples={8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

// soft key light from behind the camera so faces turned toward the player
// stay readable even when the sun is low ahead
function FillLight() {
  const ref = useRef();
  const { camera, scene } = useThree();
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    scene.add(target);
    return () => scene.remove(target);
  }, [scene, target]);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const L = ref.current;
    if (!L) return;
    camera.getWorldDirection(dir);
    L.position.copy(camera.position).addScaledVector(dir, -4).add({ x: 0, y: 6, z: 0 });
    target.position.copy(camera.position).addScaledVector(dir, 20);
    L.target = target;
    L.intensity = 1.0 + SKY.night * 0.3;
    L.color.copy(SKY.sunColor).lerp(SKY.hemiSky, 0.5);
  });
  return <directionalLight ref={ref} />;
}

// Image-based lighting from our own sky, refreshed as the time of day moves,
// so metal (scooters, cans) and glossy surfaces reflect the sunset.
function SkyEnvironment() {
  const { gl, scene } = useThree();
  const state = useMemo(() => {
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: SKY.zenith },
        uMid: { value: SKY.mid },
        uHorizon: { value: SKY.horizon },
        uSun: { value: SKY.sun },
        uSunDir: { value: SKY.sunDir },
        uTime: { value: 0 },
        uStars: { value: 0 },
        uNight: { value: 0 },
      },
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
    // a warm ground bounce under the horizon
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: '#5a6a3a' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    return { envScene, mat, pmrem: new THREE.PMREMGenerator(gl), lastTod: -1, rt: null, ground };
  }, [gl]);
  useEffect(
    () => () => {
      state.pmrem.dispose();
      if (state.rt) state.rt.dispose();
      scene.environment = null;
    },
    [state, scene]
  );
  useFrame(() => {
    if (Math.abs(SKY.tod - state.lastTod) < 0.04) return;
    state.lastTod = SKY.tod;
    state.mat.uniforms.uNight.value = SKY.night;
    state.ground.material.color.copy(SKY.hemiGround).multiplyScalar(1.2);
    const rt = state.pmrem.fromScene(state.envScene, 0.02);
    if (state.rt) state.rt.dispose();
    state.rt = rt;
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55 - SKY.night * 0.25;
  });
  return null;
}

// a bright disc where the sun is: the source for the light-ray effect
export const sunRef = { current: null };
function Sun() {
  const ref = useRef();
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    m.position.copy(camera.position).addScaledVector(SKY.sunDir, 420);
    m.material.color.copy(SKY.sun).multiplyScalar(5 - SKY.night * 3.5);
    m.visible = SKY.sunDir.y > -0.05;
  });
  return (
    <mesh
      ref={el => {
        ref.current = el;
        sunRef.current = el;
      }}
      frustumCulled={false}
    >
      <sphereGeometry args={[11, 24, 12]} />
      <meshBasicMaterial color="#fff2cf" fog={false} toneMapped={false} />
    </mesh>
  );
}

export default function Atmosphere({ shadows = true, shadowSize = 2048 }) {
  const { scene } = useThree();
  const fog = useMemo(() => new THREE.Fog('#ffffff', 50, 300), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);
  const q = useMemo(() => ({}), []);
  useFrame((_, dt) => {
    shared.uTime.value += dt;
    shared.uOrigin.value.set(runtime.origin.x, 0, runtime.origin.z);
    if (!runtime.world) return;
    runnerLerp(q);
    // attract mode lingers on golden hour
    const tod = runtime.mode === 'attract' ? 0.85 + Math.sin(shared.uTime.value * 0.03) * 0.1 : timeOfDayAt(q.s);
    if (Math.abs(tod - SKY.tod) > 1e-4) blend(tod);
    shared.uNight.value = SKY.night;
    fog.color.copy(SKY.fog);
    const stage = runtime.world.stage;
    fog.near = stage === 2 ? 70 : 45;
    fog.far = stage === 2 ? 340 : 260;
  });
  return (
    <>
      <SkyDome />
      <SkyEnvironment />
      <Sun />
      <CloudSea />
      <Lights shadows={shadows} shadowSize={shadowSize} />
    </>
  );
}
