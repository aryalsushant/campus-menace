import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../core/store';
import { runtime } from '../core/runtime';
import { buildSection, buildCrossing } from './campus';
import { materials } from './materials';

function Mesh({ geo, mat, shadows = true, receive = true }) {
  if (!geo) return null;
  return <mesh geometry={geo} material={mat} castShadow={shadows} receiveShadow={receive} />;
}

const Section = memo(function Section({ seg }) {
  const m = materials();
  const g = useMemo(() => buildSection(seg, runtime.world.track), [seg]);
  useEffect(() => () => Object.values(g).forEach(x => x && x.dispose && x.dispose()), [g]);
  return (
    <group>
      <Mesh geo={g.path} mat={m.path} shadows={false} />
      <Mesh geo={g.lawn} mat={m.lawn} shadows={false} />
      <Mesh geo={g.terrain} mat={m.terrain} shadows={false} />
      <Mesh geo={g.props} mat={m.props} />
      <Mesh geo={g.metal} mat={m.metal} />
      <Mesh geo={g.canopy} mat={m.canopy} />
      <Mesh geo={g.glow} mat={m.glow} shadows={false} receive={false} />
      <Mesh geo={g.windows} mat={m.windows} shadows={false} receive={false} />
    </group>
  );
});

function CollapsePlank({ geo, center, padId }) {
  const ref = useRef();
  const st = useRef({ fall: 0, vy: 0, spin: (Math.random() - 0.5) * 2 });
  // geometry is built around the origin; the mesh sits at `center`
  const local = geo;
  useFrame((_, dt) => {
    const pad = runtime.world.surfaces.pads.find(p => p.id === padId);
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
  return <mesh ref={ref} geometry={local} material={materials().props} castShadow receiveShadow />;
}

const Crossing = memo(function Crossing({ seg, prev }) {
  const m = materials();
  const g = useMemo(() => buildCrossing(seg, runtime.world, prev), [seg, prev]);
  useEffect(
    () => () => {
      for (const k of ['props', 'metal', 'glow', 'terrain', 'water']) g[k] && g[k].dispose();
      g.collapse.forEach(c => c.geo.dispose());
    },
    [g]
  );
  return (
    <group>
      <Mesh geo={g.props} mat={m.props} />
      <Mesh geo={g.metal} mat={m.metal} />
      <Mesh geo={g.terrain} mat={m.terrain} shadows={false} />
      <Mesh geo={g.glow} mat={m.glow} shadows={false} receive={false} />
      {g.water && <mesh geometry={g.water} material={m.water} />}
      {g.collapse.map(c => (
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

