import { useEffect, useRef } from 'react';
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as ComposerImpl } from 'postprocessing';
import { runtime } from '../game/Runtime';
import { flashScale, useGame } from '../game/GameState';

// Cinematic finish on High graphics: HDR bloom so diyas, windows and sparks actually glow,
// ACES tone mapping, a little extra saturation for festive colour, and a soft vignette.
// The bloom stack follows pmndrs/postprocessing (MIT), as used in deadronos/voxel-celebration (MIT).
// Low graphics skips the composer entirely and renders straight to the screen.

export function PostFX() {
  const graphics = useGame((s) => s.settings.graphics);
  const flash = useGame((s) => s.settings.flash);
  const ref = useRef<ComposerImpl>(null);

  useEffect(() => {
    runtime.composer = graphics === 'high' ? ref.current : null;
    return () => {
      runtime.composer = null;
    };
  }, [graphics]);

  if (graphics !== 'high') return null;
  return (
    <EffectComposer ref={ref} multisampling={4} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.18} intensity={0.5 + 0.55 * flashScale(flash)} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.14} />
      <BrightnessContrast brightness={0.02} contrast={0.08} />
      <Vignette offset={0.32} darkness={0.5} />
    </EffectComposer>
  );
}
