import { useEffect } from 'react';
import { on } from '../core/bus';

// Call `fn({ dx, dz })` whenever the scene re-centres on a new floating
// origin (see runtime.origin), so anything holding world positions across
// frames can move them by the same amount. `fn` should only touch refs.
export function useOriginShift(fn) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => on('originShift', fn), []);
}

export const shiftVec = (v, { dx, dz }) => {
  v.x -= dx;
  v.z -= dz;
};
