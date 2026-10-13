// Tiny event bus: the simulation's events fan out to audio, effects and UI.
const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

export function emit(type, data) {
  const set = handlers.get(type);
  if (set) for (const fn of set) fn(data);
  const all = handlers.get('*');
  if (all) for (const fn of all) fn(type, data);
}
