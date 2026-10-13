// Builds campus chunk geometry off the main thread.
// In: { key, kind, seg, prev, pieces, pads }. Out: { key, layers, collapse }
// with every attribute array transferred (zero-copy).
import { buildSection, buildCrossing } from './campus';
import { createTrack } from '../sim/track';
import { createSurfaces } from '../sim/surfaces';

function trackFrom(pieces) {
  const t = createTrack();
  for (const p of pieces) t.pieces.push({ ...p });
  return t;
}

const packGeo = (g, transfer) => {
  if (!g) return null;
  const attrs = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = a.array.slice();
    attrs[name] = { array: arr, itemSize: a.itemSize, normalized: a.normalized };
    transfer.push(arr.buffer);
  }
  let index = null;
  if (g.index) {
    index = g.index.array.slice();
    transfer.push(index.buffer);
  }
  return { attrs, index };
};

self.onmessage = e => {
  const { key, kind, seg, prev, pieces, pads } = e.data;
  try {
    const track = trackFrom(pieces);
    let out;
    if (kind === 'section') out = { ...buildSection(seg, track), collapse: [] };
    else {
      const surfaces = createSurfaces();
      for (const p of pads) surfaces.pads.push({ ...p });
      out = buildCrossing(seg, { track, surfaces }, prev);
    }
    const transfer = [];
    const layers = {};
    for (const [k, g] of Object.entries(out)) if (k !== 'collapse' && g && g.isBufferGeometry) layers[k] = packGeo(g, transfer);
    const collapse = (out.collapse || []).map(c => ({ padId: c.padId, center: [c.center.x, c.center.y, c.center.z], geo: packGeo(c.geo, transfer) }));
    self.postMessage({ key, layers, collapse }, transfer);
  } catch (err) {
    self.postMessage({ key, error: String(err && err.stack ? err.stack : err) });
  }
};
