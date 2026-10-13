import * as THREE from 'three';
import { Builder } from './geo';
import { withRim } from './materials';

// Shared hero props: the VOLT energy drink can and the pizza slice.

let can = null;
export function canAssets() {
  if (can) return can;
  // lathe profile (radius, height) in metres: domed base, body, shoulder, neck, rim
  const R = 0.033;
  const pts = [
    [0, 0.004],
    [R * 0.7, 0.0],
    [R * 0.95, 0.006],
    [R, 0.014],
    [R, 0.104],
    [R * 0.93, 0.114],
    [R * 0.82, 0.12],
    [R * 0.84, 0.123],
    [R * 0.78, 0.124],
    [0, 0.121],
  ].map(([x, y]) => new THREE.Vector2(x, y - 0.062));
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.computeVertexNormals();

  // label: mint and black with a lightning bolt and VOLT lettering
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#0d1f1a');
  grd.addColorStop(1, '#06120e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#3dffb0';
  g.fillRect(0, 10, 256, 6);
  g.fillRect(0, 112, 256, 6);
  for (const x0 of [10, 138]) {
    g.beginPath();
    g.moveTo(x0 + 34, 22);
    g.lineTo(x0 + 14, 66);
    g.lineTo(x0 + 30, 66);
    g.lineTo(x0 + 20, 106);
    g.lineTo(x0 + 50, 54);
    g.lineTo(x0 + 34, 54);
    g.lineTo(x0 + 46, 22);
    g.closePath();
    g.fillStyle = '#3dffb0';
    g.fill();
    g.save();
    g.translate(x0 + 64, 64);
    g.rotate(-Math.PI / 2);
    g.font = '900 30px Arial Black, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.fillText('VOLT', 0, 11);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // lathe uv.y runs along the profile; keep the label off the top and bottom
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const y = geo.attributes.position.getY(i) + 0.062;
    uv.setY(i, THREE.MathUtils.clamp((y - 0.014) / 0.09, 0.02, 0.98));
  }
  const body = withRim(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.75, roughness: 0.28, emissive: new THREE.Color('#0a3a2a'), emissiveIntensity: 0.35 }), '#b8ffe6', 0.6);
  const tab = new THREE.MeshStandardMaterial({ color: '#c8ced6', metalness: 0.9, roughness: 0.3 });
  const tabGeo = new THREE.BoxGeometry(0.018, 0.003, 0.03);
  tabGeo.translate(0, 0.062, 0.006);
  can = { geo, body, tab, tabGeo, tex };
  return can;
}

export function pizzaGeometry() {
  const b = new Builder();
  // wedge with a little thickness, crust along the wide end
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.38);
  shape.lineTo(-0.31, 0.26);
  shape.quadraticCurveTo(0, 0.35, 0.31, 0.26);
  shape.lineTo(0, -0.38);
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  wedge.translate(0, 0, -0.025);
  b.add(wedge, { color: '#f0b04a', jitter: 0 });
  // cheese layer, slightly smaller, on the front face
  const cheese = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
  cheese.scale(0.9, 0.9, 1);
  cheese.translate(0, -0.01, 0.03);
  b.add(cheese, { color: '#ffd75a', jitter: 0 });
  // puffy crust
  b.add(new THREE.CapsuleGeometry(0.055, 0.56, 4, 8), { pos: [0, 0.29, 0.005], rot: [0, 0, Math.PI / 2], color: '#d8892f', jitter: 0 });
  // cheese drips off the tip and sides
  for (const [x, y, s] of [
    [0, -0.36, 0.05],
    [-0.16, -0.05, 0.035],
    [0.2, 0.05, 0.03],
  ])
    b.add(new THREE.SphereGeometry(s, 8, 6), { pos: [x, y, 0.035], scale: [1, 1.6, 0.6], color: '#ffd75a', jitter: 0 });
  // pepperoni with a darker rim
  for (const [x, y] of [
    [-0.09, 0.12],
    [0.11, 0.07],
    [0.0, -0.12],
    [-0.02, 0.2],
  ]) {
    b.add(new THREE.CylinderGeometry(0.058, 0.058, 0.018, 14), { pos: [x, y, 0.045], rot: [Math.PI / 2, 0, 0], color: '#b8302a', jitter: 0 });
    b.add(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 12), { pos: [x, y, 0.047], rot: [Math.PI / 2, 0, 0], color: '#d6402f', jitter: 0 });
  }
  // basil flecks
  for (const [x, y] of [
    [0.05, 0.16],
    [-0.12, 0.02],
    [0.08, -0.04],
  ])
    b.add(new THREE.BoxGeometry(0.03, 0.02, 0.01), { pos: [x, y, 0.05], rot: [0, 0, x * 20], color: '#3f8f3a', jitter: 0 });
  return b.build();
}
