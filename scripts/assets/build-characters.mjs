// Packs the CC0 Quaternius characters and animations for the web:
//   node scripts/assets/build-characters.mjs
// Source (not committed): assets-src/ubc (Universal Base Characters),
// assets-src/ual (Universal Animation Library). Output: public/assets/characters.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const OUT = 'public/assets/characters';
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const KEEP_ANIMS = [
  'Sprint_Loop',
  'Jog_Fwd_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Roll',
  'Hit_Chest',
  'Death01',
  'Punch_Cross',
  'Idle_Loop',
  'Idle_Talking_Loop',
  'Sitting_Idle_Loop',
  'Dance_Loop',
  'Walk_Loop',
  'Crouch_Idle_Loop',
];

async function write(doc, name) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/${name}`, doc);
  console.log(name, (statSync(`${OUT}/${name}`).size / 1024).toFixed(0), 'KB');
}

// ---- animations: keep only the clips we use, drop the mannequin mesh
{
  const doc = await io.read('assets-src/ual/Unreal-Godot/UAL1_Standard.glb');
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) a.dispose();
  // finger keyframes are invisible at running speed: drop them
  for (const a of root.listAnimations()) {
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode();
      const path = ch.getTargetPath();
      const fingers = n && /(index|middle|ring|pinky|thumb)_/i.test(n.getName());
      // mocap bones only rotate; keep translation on the hips and root only
      const extra = n && path !== 'rotation' && !/^(root|pelvis)$/i.test(n.getName());
      if (fingers || extra) {
        const smp = ch.getSampler();
        ch.dispose();
        smp.dispose();
      }
    }
  }
  for (const n of root.listNodes()) {
    if (n.getMesh()) n.getMesh().dispose();
    if (n.getSkin()) n.setSkin(null);
  }
  for (const s of root.listSkins()) s.dispose();
  await doc.transform(resample({ tolerance: 0.002 }));
  // drop every accessor no animation still uses
  const used = new Set();
  for (const a of root.listAnimations()) for (const smp of a.listSamplers()) used.add(smp.getInput()).add(smp.getOutput());
  for (const acc of root.listAccessors()) if (!used.has(acc)) acc.dispose();
  for (const m of root.listMaterials()) m.dispose();
  await write(doc, 'anims.glb');
}

// ---- bodies: the suit textures are replaced at runtime by a clothing shader,
// so only the eye textures are kept (small)
for (const [src, name] of [
  ['assets-src/ubc/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf', 'body-m.glb'],
  ['assets-src/ubc/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf', 'body-f.glb'],
]) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const m of root.listMaterials()) {
    if (/Superhero/i.test(m.getName())) {
      m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null);
    }
  }
  await doc.transform(weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256] }));
  await write(doc, name);
}

// ---- hairstyles + eyebrows as static meshes in character space
{
  const files = ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale', 'Hair_Beard', 'Eyebrows_Regular', 'Eyebrows_Female'];
  const base = await io.read(`assets-src/ubc/Hairstyles/Origin at 0/glTF (Godot)/${files[0]}.gltf`);
  const { mergeDocuments } = await import('@gltf-transform/functions');
  for (const f of files.slice(1)) {
    const other = await io.read(`assets-src/ubc/Hairstyles/Origin at 0/glTF (Godot)/${f}.gltf`);
    mergeDocuments(base, other);
  }
  // one scene with every hairstyle node
  const root = base.getRoot();
  const scene = root.listScenes()[0];
  for (const s of root.listScenes().slice(1)) {
    for (const n of s.listChildren()) scene.addChild(n);
    s.dispose();
  }
  for (const b of root.listBuffers().slice(1)) {
    for (const a of root.listAccessors()) if (a.getBuffer() === b) a.setBuffer(root.listBuffers()[0]);
    b.dispose();
  }
  await base.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }));
  await write(base, 'hair.glb');
}
