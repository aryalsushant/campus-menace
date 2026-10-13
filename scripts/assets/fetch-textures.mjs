// Downloads CC0 PBR textures from Poly Haven and packs them as WebP:
//   node scripts/assets/fetch-textures.mjs
// Output: public/assets/textures/<key>_{diff,nor,rough}.webp
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const OUT = 'public/assets/textures';
mkdirSync(OUT, { recursive: true });

// key -> [poly haven id, output size]
const SET = {
  brick: ['red_brick', 512],
  path: ['herringbone_brick', 1024],
  slate: ['roof_slates_02', 512],
  plaster: ['painted_plaster_wall', 256],
  sandstone: ['white_sandstone_blocks_02', 512],
  grass: ['leafy_grass', 512],
  bark: ['bark_brown_02', 512],
  planks: ['brown_planks_05', 512],
  marble: ['marble_01', 512],
  mud: ['brown_mud_dry', 512],
  metal: ['metal_plate', 256],
  concrete: ['concrete_pavement', 512],
};

const MAPS = { diff: 'Diffuse', nor: 'nor_gl', rough: 'Rough' };

for (const [key, [id, size]] of Object.entries(SET)) {
  const info = await (await fetch(`https://api.polyhaven.com/info/${id}`)).json();
  if (!info || info.type !== 1) throw new Error(`${id}: not a texture`);
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [suffix, map] of Object.entries(MAPS)) {
    const entry = files[map] && files[map]['1k'] && files[map]['1k'].jpg;
    if (!entry) {
      console.warn(`${id}: no ${map}`);
      continue;
    }
    const buf = Buffer.from(await (await fetch(entry.url)).arrayBuffer());
    const out = `${OUT}/${key}_${suffix}.webp`;
    await sharp(buf).resize(size, size).webp({ quality: suffix === 'diff' ? 82 : 75 }).toFile(out);
    console.log(out, (statSync(out).size / 1024).toFixed(0), 'KB');
  }
}
