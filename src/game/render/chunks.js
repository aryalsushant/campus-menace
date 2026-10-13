import * as THREE from 'three';
import { buildSection, buildCrossing } from './campus';
import { getGame, setGame } from '../core/store';
import { runtime } from '../core/runtime';

// Campus chunks are built in a Web Worker so streaming new campus never
// blocks a frame. Results are cached per world (seed) and segment id.

let worker = null;
let failed = false;
const cache = new Map(); // key -> { status: 'pending' | 'ready', result }
const queue = [];
let busy = false;

const keyOf = (world, seg) => `${world.seed}:${seg.id}`;

function getWorker() {
  if (worker || failed) return worker;
  try {
    worker = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onResult;
    worker.onerror = e => {
      console.warn('chunk worker failed, building on the main thread', e.message);
      failed = true;
      worker = null;
      busy = false;
      pump();
    };
  } catch {
    failed = true;
  }
  return worker;
}

const unpackGeo = p => {
  if (!p) return null;
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(p.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return g;
};

function onResult(e) {
  const { key, layers, collapse, error } = e.data;
  busy = false;
  const entry = cache.get(key);
  if (error) {
    console.warn('chunk build error', error);
    if (entry) entry.status = 'error';
  } else if (entry) {
    const result = {};
    for (const [k, p] of Object.entries(layers)) result[k] = unpackGeo(p);
    result.collapse = collapse.map(c => ({ padId: c.padId, center: new THREE.Vector3(...c.center), geo: unpackGeo(c.geo) }));
    entry.status = 'ready';
    entry.result = result;
    setGame({ chunkVersion: (getGame().chunkVersion || 0) + 1 });
  }
  pump();
}

// the nearest pending job goes first
function pump() {
  if (busy || !queue.length) return;
  // the live world first, then nearest chunk first
  queue.sort((a, b) => (a.world === runtime.world ? 0 : 1) - (b.world === runtime.world ? 0 : 1) || a.seg.s0 - b.seg.s0);
  const job = queue.shift();
  const entry = cache.get(job.key);
  if (!entry || entry.status !== 'pending') return pump();
  const w = getWorker();
  if (!w) {
    // fallback: build synchronously, one chunk per idle slot
    const run = () => {
      const r = job.seg.kind === 'section' ? { ...buildSection(job.seg, job.world.track), collapse: [] } : buildCrossing(job.seg, job.world, job.prev);
      entry.status = 'ready';
      entry.result = r;
      setGame({ chunkVersion: (getGame().chunkVersion || 0) + 1 });
      pump();
    };
    (window.requestIdleCallback || (f => setTimeout(f, 0)))(run);
    return;
  }
  busy = true;
  const { world, seg, prev } = job;
  const lo = seg.s0 - 80;
  const hi = seg.s1 + 80;
  const pieces = world.track.pieces.filter(p => p.s0 + p.len >= lo && p.s0 <= hi);
  const pads = world.surfaces.pads.filter(p => p.s1 >= lo && p.s0 <= hi).map(p => ({ ...p }));
  w.postMessage({ key: job.key, kind: seg.kind, seg, prev: prev ? { w: prev.w, kind: prev.kind } : null, pieces, pads });
}

export function requestChunk(world, seg, prev) {
  const key = keyOf(world, seg);
  let entry = cache.get(key);
  if (!entry) {
    entry = { status: 'pending', result: null };
    cache.set(key, entry);
    queue.push({ key, world, seg, prev });
    pump();
  }
  return entry.status === 'ready' ? entry.result : null;
}

// queue every chunk of a world (used to prebuild the next run's world)
export function prebuildWorld(world) {
  world.segments.forEach((seg, i) => requestChunk(world, seg, world.segments[i - 1]));
}

// free chunks that are no longer in any live world
export function releaseChunks(liveWorlds) {
  const keep = new Set();
  for (const w of liveWorlds) if (w) for (const s of w.segments) keep.add(keyOf(w, s));
  for (const [key, entry] of cache) {
    if (keep.has(key) || entry.status === 'pending') continue;
    if (entry.result) {
      for (const [k, g] of Object.entries(entry.result)) if (k !== 'collapse' && g && g.dispose) g.dispose();
      (entry.result.collapse || []).forEach(c => c.geo && c.geo.dispose());
    }
    cache.delete(key);
  }
}
