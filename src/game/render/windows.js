import * as THREE from 'three';
import { shared } from './materials';

// Painted sash windows: frame, 6-over-6 muntins and glass in one texture,
// so each window is one quad instead of ten little boxes.
// Atlas tiles (2x3, same layout as the foliage cards): 0 lit, 1 dark.

let mat = null;

function paint(emissive) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S * 3;
  const g = c.getContext('2d');
  g.fillStyle = emissive ? '#000' : '#f4efe6';
  g.fillRect(0, 0, c.width, c.height);
  const tile = (i, lit) => {
    const ox = (i % 2) * S;
    const oy = Math.floor(i / 2) * S;
    const fx = ox + S * 0.1;
    const fy = oy + S * 0.06;
    const fw = S * 0.8;
    const fh = S * 0.88;
    if (emissive) {
      if (lit) {
        const grd = g.createLinearGradient(0, fy, 0, fy + fh);
        grd.addColorStop(0, '#ffd78a');
        grd.addColorStop(1, '#ffb45a');
        g.fillStyle = grd;
        g.fillRect(fx, fy, fw, fh);
      }
    } else {
      // outer frame shadow, then glass
      g.fillStyle = '#d8d0c2';
      g.fillRect(ox + S * 0.06, oy + S * 0.02, S * 0.88, S * 0.96);
      const grd = g.createLinearGradient(0, fy, 0, fy + fh);
      if (lit) {
        grd.addColorStop(0, '#ffe2a8');
        grd.addColorStop(1, '#e6a860');
      } else {
        grd.addColorStop(0, '#8fa6c2');
        grd.addColorStop(0.5, '#3e4e66');
        grd.addColorStop(1, '#283446');
      }
      g.fillStyle = grd;
      g.fillRect(fx, fy, fw, fh);
      if (lit) {
        // curtains drawn to the sides
        g.fillStyle = 'rgba(160,70,50,0.55)';
        g.fillRect(fx, fy, fw * 0.16, fh);
        g.fillRect(fx + fw * 0.84, fy, fw * 0.16, fh);
      } else {
        // a streak of reflected sky
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.moveTo(fx + fw * 0.2, fy);
        g.lineTo(fx + fw * 0.45, fy);
        g.lineTo(fx + fw * 0.15, fy + fh);
        g.lineTo(fx - fw * 0.1, fy + fh);
        g.fill();
      }
    }
    // muntins: 3 columns x 4 rows (6-over-6) and the meeting rail
    g.fillStyle = emissive ? '#000' : '#f8f4ec';
    for (let k = 1; k < 3; k++) g.fillRect(fx + (fw * k) / 3 - 3, fy, 6, fh);
    for (let k = 1; k < 4; k++) g.fillRect(fx, fy + (fh * k) / 4 - (k === 2 ? 6 : 3), fw, k === 2 ? 12 : 6);
    // frame
    g.strokeStyle = emissive ? '#000' : '#f8f4ec';
    g.lineWidth = 12;
    g.strokeRect(fx, fy, fw, fh);
  };
  tile(0, true);
  tile(1, false);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function windowMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({ map: paint(false), emissiveMap: paint(true), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1, roughness: 0.35, metalness: 0.1, vertexColors: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = shared.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.12, 1.6, uNight);');
  };
  mat.customProgramCacheKey = () => 'painted-windows';
  return mat;
}
