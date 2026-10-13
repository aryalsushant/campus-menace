// Encode the campus colour and roughness textures to KTX2 (Basis ETC1S) so
// the GPU keeps them compressed (~8x less memory and sampling bandwidth).
// Normal maps stay webp: ETC1S blocks them up and UASTC is ~6x the download.
// Usage: node scripts/assets/build-ktx2.mjs
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const SRC = 'public/assets/textures';
const OUT = path.join(SRC, 'ktx2');

const imageDecoder = async buffer => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

const optionsFor = name => {
  const base = { generateMipmap: true, isYFlip: true, imageDecoder };
  if (name.endsWith('_rough')) return { ...base, isUASTC: false, isPerceptual: false, qualityLevel: 160, compressionLevel: 4 };
  return { ...base, isUASTC: false, isPerceptual: true, qualityLevel: 200, compressionLevel: 4 };
};

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter(f => f.endsWith('.webp') && !f.endsWith('_nor.webp'));
let before = 0;
let after = 0;
for (const f of files) {
  const name = f.replace(/\.webp$/, '');
  // basis wants PNG or raw RGBA; go through PNG so every input decodes the same
  const src = await readFile(path.join(SRC, f));
  const png = await sharp(src).png().toBuffer();
  const out = await encodeToKTX2(new Uint8Array(png), optionsFor(name));
  await writeFile(path.join(OUT, `${name}.ktx2`), out);
  before += src.length;
  after += out.length;
  console.log(`${name.padEnd(16)} ${(src.length / 1024).toFixed(0).padStart(5)} KB -> ${(out.length / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`total ${(before / 1024).toFixed(0)} KB webp -> ${(after / 1024).toFixed(0)} KB ktx2`);
