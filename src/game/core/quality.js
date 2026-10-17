// Quality tiers. 'auto' starts from a guess based on the GPU and may step
// down (or back up) between runs, never during one: switching mid-run
// recompiles shaders and rebuilds buffers, which freezes the game.
export const TIERS = {
  // render scale range. Phones have 2.5-3x screens: rendering at 1x and
  // stretching makes everything soft and jagged, so even low goes to 1.5x
  // and pays for it with fewer effects.
  low: { dpr: [1, 1.5], shadows: false, shadowSize: 1024, grass: 0 },
  medium: { dpr: [1, 1.75], shadows: true, shadowSize: 1024, grass: 4500 },
  high: { dpr: [1, 1.5], shadows: true, shadowSize: 2048, grass: 7000 },
};

// The GPU name says far more than the CPU core count (every laptop has 8+
// threads, including ones with weak integrated graphics).
export function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return name;
  } catch {
    return '';
  }
}

export function guessTier(gpu = gpuName()) {
  if (typeof navigator === 'undefined') return 'medium';
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'low';
  if (touch) {
    // iPhones and iPads report only "Apple GPU"; anything from the last
    // several years handles medium
    if (/apple/.test(g)) return 'medium';
    const adreno = /adreno[^\d]*(\d{3})/.exec(g);
    if (adreno) return +adreno[1] >= 640 ? 'medium' : 'low';
    if (/mali-g(7\d|6[1-9]|\d{3})|xclipse|immortalis/.test(g)) return 'medium';
    if (/mali|powervr|adreno/.test(g)) return 'low';
    return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  }
  // desktops and laptops
  if (/nvidia|geforce|rtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(g)) return 'high';
  if (/intel.*(uhd|hd) graphics|intel\(r\) (uhd|hd)|mesa intel.*(uhd|hd)/.test(g)) return 'low';
  return 'medium';
}

export const tierDown = t => (t === 'high' ? 'medium' : 'low');
export const tierUp = t => (t === 'low' ? 'medium' : 'high');
