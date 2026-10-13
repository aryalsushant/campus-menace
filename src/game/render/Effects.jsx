import { EffectComposer, Bloom, Vignette, SMAA, N8AO, ToneMapping, HueSaturation, BrightnessContrast, GodRays } from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction, KernelSize } from 'postprocessing';
import { useEffect, useState } from 'react';
import { sunRef } from './Atmosphere';

// Post stack per quality tier. Low skips the composer and uses the
// renderer's own tone mapping.
export default function Effects({ tier }) {
  const [sun, setSun] = useState(null);
  useEffect(() => {
    const id = setInterval(() => sunRef.current && setSun(sunRef.current), 200);
    return () => clearInterval(id);
  }, []);
  if (tier === 'low') return null;
  if (tier === 'high' && sun) {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false} autoClear={false}>
        <N8AO aoRadius={1.1} distanceFalloff={0.6} intensity={0.9} quality="performance" halfRes color="#2a1840" />
        <GodRays sun={sun} samples={40} density={0.94} decay={0.93} weight={0.35} exposure={0.45} clampMax={1} kernelSize={KernelSize.SMALL} blur blendFunction={BlendFunction.SCREEN} />
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.14} />
        <BrightnessContrast brightness={0.01} contrast={0.08} />
        <Vignette offset={0.3} darkness={0.5} />
        <SMAA />
      </EffectComposer>
    );
  }
  if (tier === 'high') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={1.1} distanceFalloff={0.6} intensity={0.9} quality="performance" halfRes color="#2a1840" />
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.75} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.14} />
        <BrightnessContrast brightness={0.01} contrast={0.08} />
        <Vignette offset={0.3} darkness={0.5} />
        <SMAA />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast contrast={0.06} />
      <Vignette offset={0.3} darkness={0.5} />
      <SMAA />
    </EffectComposer>
  );
}
