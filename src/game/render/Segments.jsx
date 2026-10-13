import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../core/store';
import { runtime } from '../core/runtime';
import { buildSection, buildCrossing } from './campus';
import { materials, pbr, texSet } from './materials';
import { foliageMaterial, foliageDepthMaterial } from './foliage';
import { windowMaterial } from './windows';

// Which material each kit layer renders with.
let MATS = null;
function kitMaterials() {
  if (MATS) return MATS;
  const m = materials();
  const T = texSet('path');
  MATS = {
    path: new THREE.MeshStandardMaterial({ color: new THREE.Color(2.1, 1.85, 1.7), map: T.diff, normalMap: T.nor, roughnessMap: T.rough, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1 }),
    brick: pbr('brick', { scale: 1 / 1.25, normal: 1.3 }),
    plaster: pbr('plaster', { scale: 0.6, normal: 0.4, rough: 0.8 }),
    stone: pbr('sandstone', { scale: 1 / 1.6, normal: 0.9 }),
    slate: pbr('slate', { scale: 1 / 1.4, normal: 1.1 }),
    concrete: pbr('concrete', { scale: 1 / 2, normal: 0.7 }),
    grass: pbr('grass', { scale: 1 / 2.2, normal: 0.6, top: true }),
    earth: pbr('mud', { scale: 1 / 5, normal: 0.9 }),
    bark: pbr('bark', { scale: 1 / 1.1, normal: 1.4 }),
    planks: pbr('planks', { scale: 1 / 1.1, normal: 1 }),
    marble: pbr('marble', { scale: 1 / 2, rough: 0.5 }),
    bronze: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.35 }),
    leaf: m.leaf,
    metal: m.metal,
    props: m.props,
    glow: m.glow,
    windows: m.windows,
    water: m.water,
    spray: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    cards: foliageMaterial(),
    wincards: windowMaterial(),
  };
  return MATS;
}

// Only things near the path cast real-time shadows: buildings sit 20+ m away
// and would otherwise be drawn whole into the shadow map every frame.
const NO_SHADOW = new Set(['glow', 'windows', 'water', 'spray', 'path', 'grass', 'earth', 'concrete', 'brick', 'plaster', 'stone', 'slate', 'marble', 'bronze', 'wincards']);
const NO_RECEIVE = new Set(['glow', 'windows', 'spray']);

function Layers({ g }) {
  const M = kitMaterials();
  return Object.entries(g).map(([k, geo]) => {
    if (!geo || !M[k] || !geo.isBufferGeometry) return null;
    return (
      <mesh
        key={k}
        geometry={geo}
        material={M[k]}
        castShadow={!NO_SHADOW.has(k)}
        receiveShadow={!NO_RECEIVE.has(k)}
        customDepthMaterial={k === 'cards' ? foliageDepthMaterial() : undefined}
      />
    );
  });
}

const Section = memo(function Section({ seg }) {
  const g = useMemo(() => buildSection(seg, runtime.world.track), [seg]);
  useEffect(() => () => Object.values(g).forEach(x => x && x.dispose && x.dispose()), [g]);
  return (
    <group>
      <Layers g={g} />
    </group>
  );
});

function CollapsePlank({ geo, center, padId }) {
  const ref = useRef();
  const st = useRef({ fall: 0, vy: 0, spin: (Math.random() - 0.5) * 2 });
  const padRef = useRef(null);
  useFrame((_, dt) => {
    if (!padRef.current || padRef.current.id !== padId) padRef.current = runtime.world.surfaces.pads.find(p => p.id === padId) || null;
    const pad = padRef.current && runtime.world.surfaces.pads.includes(padRef.current) ? padRef.current : null;
    const o = ref.current;
    if (!o) return;
    const t = runtime.world.t;
    if (!pad || pad.gone) {
      const s = st.current;
      s.vy -= 30 * dt;
      s.fall += s.vy * dt;
      o.position.set(center.x, center.y + s.fall, center.z);
      o.rotation.x += s.spin * dt;
      o.rotation.z += s.spin * 0.6 * dt;
      o.visible = s.fall > -40;
    } else if (pad.touchedAt >= 0) {
      const k = (t - pad.touchedAt) / pad.delay;
      o.position.set(center.x + Math.sin(t * 70) * 0.04 * k, center.y - k * 0.08, center.z);
    } else o.position.set(center.x, center.y, center.z);
  });
  return <mesh ref={ref} geometry={geo} material={kitMaterials().planks} castShadow receiveShadow />;
}

const Crossing = memo(function Crossing({ seg, prev }) {
  const g = useMemo(() => buildCrossing(seg, runtime.world, prev), [seg, prev]);
  useEffect(
    () => () => {
      for (const v of Object.values(g)) if (v && v.dispose) v.dispose();
      g.collapse.forEach(c => c.geo.dispose());
    },
    [g]
  );
  const { collapse, ...layers } = g;
  return (
    <group>
      <Layers g={layers} />
      {collapse.map(c => (
        <CollapsePlank key={c.padId} geo={c.geo} center={c.center} padId={c.padId} />
      ))}
    </group>
  );
});

export default function Segments() {
  useGame(s => s.segVersion);
  const segs = runtime.world ? runtime.world.segments : [];
  return segs.map((seg, i) => (seg.kind === 'section' ? <Section key={seg.id} seg={seg} /> : <Crossing key={seg.id} seg={seg} prev={segs[i - 1]} />));
}
