import { EffectComposer, Bloom, Vignette, ToneMapping, HueSaturation, BrightnessContrast, GodRays } from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction, KernelSize } from 'postprocessing';
import { useEffect, useState } from 'react';
import { sunRef } from './Atmosphere';

// Post stack per quality tier. Low skips the composer and uses the
// renderer's own tone mapping and anti-aliasing. Medium and high render with
// 4x MSAA, which keeps thin edges (grass, leaves, window frames) steady in
// motion; SMAA only smooths each frame on its own and let them crawl.
// Ambient occlusion was dropped: it cost about 40% of the frame on high.
export default function Effects({ tier }) {
  const [sun, setSun] = useState(null);
  useEffect(() => {
    const id = setInterval(() => sunRef.current && setSun(sunRef.current), 200);
    return () => clearInterval(id);
  }, []);
  if (tier === 'low') return null;
  if (tier === 'high' && sun) {
    return (
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <GodRays sun={sun} samples={22} density={0.94} decay={0.92} weight={0.38} exposure={0.45} clampMax={1} kernelSize={KernelSize.VERY_SMALL} resolutionScale={0.5} blur blendFunction={BlendFunction.SCREEN} />
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.14} />
        <BrightnessContrast brightness={0.01} contrast={0.08} />
        <Vignette offset={0.3} darkness={0.5} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast contrast={0.06} />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  );
}
