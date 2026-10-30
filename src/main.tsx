import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/rozha-one';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/baloo-2/400.css';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import './styles/global.css';
import './styles/ident.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles/ui.css';
import gsap from 'gsap';
import App from './App';
import { SITE } from './config/site';

document.title = `${SITE.name} — ${SITE.tagline}`;

// On slow GPUs gsap's default lag smoothing stretches every tween (a 1 s reveal can take a minute);
// let tweens keep real time so the reveal flow never stalls.
gsap.ticker.lagSmoothing(0);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Test hook for automated browser checks (?debug)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  Promise.all([import('./game/Runtime'), import('./game/GameState'), import('./world/WorldBuilder'), import('./game/DiscoverySystem'), import('./input/HandTracker'), import('./input/handFeatures'), import('./intro/identState'), import('./street/StreetLayout'), import('./street/Crowd'), import('./street/Locations'), import('./game/FireworkSystem'), import('./street/Traffic'), import('./audio/AudioEngine')]).then(([r, g, w, d, h, f, i, s, c, l, fw, tr, au]) => {
    (window as unknown as Record<string, unknown>).__pataka = { runtime: r.runtime, useGame: g.useGame, world: w.getWorld(), discovery: d, hands: { ...h, describeHand: f.describeHand }, ident: i, street: s, crowd: c.crowd, locations: l, fw, traffic: tr.trafficState, audio: au.audio };
  });
}
