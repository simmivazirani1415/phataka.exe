import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useGame, hydrateMemories } from './game/GameState';
import { runtime } from './game/Runtime';
import { IntroScreen } from './components/IntroScreen';
import { GameHUD, SkipIntro } from './components/GameHUD';
import { PackageReveal } from './components/PackageReveal';
import { NewMemory } from './components/PolaroidCard';
import { CollectionTray } from './components/CollectionTray';
import { MemoryAlbum } from './components/MemoryAlbum';
import { SettingsPanel } from './components/SettingsPanel';
import { GestureLayer } from './components/GestureLayer';
import { PACKAGES, PACKAGE_BY_ID } from './assets/AssetRegistry';
import { getThumbUrl } from './assets/PackageTextures';
import { beginReveal, closeActive } from './game/DiscoverySystem';
import { audio } from './audio/AudioEngine';

const WorldScene = lazy(() => import('./world/WorldScene'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Fallback({ reason }: { reason: string }) {
  return (
    <div className="fallback">
      <h1 className="logo-big">
        Pataka<span>.exe</span>
      </h1>
      <p className="tagline">Har ghar mein ek pataka hai.</p>
      <p>{reason}</p>
      <ul className="fallback-grid">
        {PACKAGES.map((p) => (
          <li key={p.id}>
            <img src={getThumbUrl(p.id)} alt={`${p.name} box`} />
            <b>{p.name}</b>
            <small>“{p.copy}”</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

class WorldBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error('3D world failed', e);
  }
  render() {
    return this.state.failed ? <Fallback reason="The 3D mohalla could not start on this device. Here is the pataka parivaar instead." /> : this.props.children;
  }
}

function FinalBanner() {
  const stage = useGame((s) => s.stage());
  const ui = useGame((s) => s.ui);
  const active = useGame((s) => s.active);
  const setUi = useGame((s) => s.setUi);
  if (stage < 8 || ui.finalSeen || ui.newMemory || active || ui.album) return null;
  return (
    <div className="final-banner" role="dialog" aria-label="Your Diwali is complete">
      <h2>Your Diwali, Your Memories.</h2>
      <p className="hand">Poora mohalla jagmaga raha hai.</p>
      <button className="btn cta" autoFocus onClick={() => setUi({ album: true, finalSeen: true })}>
        Open My Memory Book
      </button>
      <button className="btn ghost small" onClick={() => setUi({ finalSeen: true })}>
        Keep exploring
      </button>
    </div>
  );
}

function ShowMePrompt() {
  const id = useGame((s) => s.ui.showMe);
  const active = useGame((s) => s.active);
  if (!id || active) return null;
  return (
    <div className="showme">
      <span>{PACKAGE_BY_ID[id].locationHint}</span>
      <button className="btn cta small" autoFocus onClick={() => beginReveal(id)}>
        Pick it up
      </button>
    </div>
  );
}

function Toasts() {
  const ui = useGame((s) => s.ui);
  const setUi = useGame((s) => s.setUi);
  const update = useGame((s) => s.updateSettings);
  useEffect(() => {
    if (!ui.toast) return;
    const t = window.setTimeout(() => setUi({ toast: null }), 3200);
    return () => window.clearTimeout(t);
  }, [ui.toast, setUi]);
  return (
    <>
      {ui.toast && (
        <p className="toast" role="status">
          {ui.toast}
        </p>
      )}
      {ui.perfSuggest && (
        <div className="toast action" role="status">
          <span>The mohalla is running a little slowly. Switch to Low Graphics?</span>
          <button
            className="btn cta tiny"
            onClick={() => {
              update({ graphics: 'low' });
              setUi({ perfSuggest: false });
            }}
          >
            Switch
          </button>
          <button className="btn ghost tiny" onClick={() => setUi({ perfSuggest: false })}>
            Keep High
          </button>
        </div>
      )}
    </>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const s = useGame.getState();
      if (e.key === 'Escape') {
        if (s.active) closeActive();
        else if (s.ui.album) s.setUi({ album: false });
        else if (s.ui.settings) s.setUi({ settings: false });
        else if (s.ui.tray) s.setUi({ tray: false });
        else if (s.ui.newMemory) s.setUi({ newMemory: null });
        else if (s.ui.howTo) s.setUi({ howTo: false });
      }
      if ((e.key === 'r' || e.key === 'R') && s.phase === 'playing' && !s.active && !s.ui.album) runtime.camera?.reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

async function fontsReady() {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  await Promise.race([
    Promise.all([fonts.load('48px "Rozha One"', 'Pataka पटाका'), fonts.load('32px "Kalam"'), fonts.load('600 20px "Baloo 2"'), fonts.load('400 20px "Baloo 2"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const reducedMotion = useGame((s) => s.settings.reducedMotion);
  const [ready, setReady] = useState(false);
  const [webgl] = useState(hasWebGL);
  useKeyboard();
  useEffect(() => {
    fontsReady().then(() => setReady(true));
    hydrateMemories();
    // sound preference is never restored: audio always starts muted
    audio.setEnabled(false);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

  if (!webgl) return <Fallback reason="This browser can't draw 3D graphics (WebGL is unavailable). Here is the pataka parivaar instead." />;

  return (
    <div className="app">
      <WorldBoundary>
        {ready && (
          <Suspense fallback={<div className="loading">Mohalla jag raha hai…</div>}>
            <WorldScene />
          </Suspense>
        )}
      </WorldBoundary>
      {!ready && <div className="loading">Mohalla jag raha hai…</div>}
      {phase === 'intro' && ready && <IntroScreen />}
      {phase === 'assembling' && <SkipIntro />}
      {phase === 'playing' && <GameHUD />}
      <PackageReveal />
      <GestureLayer />
      <NewMemory />
      <CollectionTray />
      <SettingsPanel />
      <MemoryAlbum />
      <ShowMePrompt />
      <FinalBanner />
      <Toasts />
    </div>
  );
}
