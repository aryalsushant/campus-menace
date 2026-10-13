// prints mesh bounds and the head bone's bind position (asset pipeline debugging)
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO();
for (const p of process.argv.slice(2)) {
  const doc = await io.read(p);
  const root = doc.getRoot();
  for (const n of root.listNodes()) {
    if (n.getMesh()) console.log(p.split('/').pop(), 'mesh', n.getName(), JSON.stringify(getBounds(n)), 'skin', !!n.getSkin());
    if (n.getName() === 'Head') console.log('Head world', n.getWorldMatrix().slice(12, 15).map(v => v.toFixed(3)).join(','));
  }
}
