import { useGame } from '../game/GameState';
import { startAssembly } from '../world/WorldScene';
import { SoundToggle } from './SoundToggle';
import { audio } from '../audio/AudioEngine';

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="howto" role="dialog" aria-label="How to play">
      <h3>Kaise khelein?</h3>
      <ol>
        <li>
          <b>Look around.</b> Drag to turn the mohalla all the way round. Scroll or pinch to zoom, right-drag or two fingers to slide.
        </li>
        <li>
          <b>Find the patakas.</b> Eight little cracker boxes are tucked into the neighbourhood. Watch for a warm glint.
        </li>
        <li>
          <b>Open and light.</b> Every box hides a different virtual cracker and a different family character.
        </li>
        <li>
          <b>Collect memories.</b> Each first show becomes a Polaroid. Fill your Diwali memory book and download it.
        </li>
      </ol>
      <p className="howto-note">Tap the bulb for a hint whenever you like. Everything here is make-believe, so no real crackers are involved.</p>
      <button className="btn ghost" onClick={onClose}>
        Samajh gaya
      </button>
    </div>
  );
}

export function IntroScreen() {
  const howTo = useGame((s) => s.ui.howTo);
  const setUi = useGame((s) => s.setUi);
  const returning = useGame((s) => Object.values(s.packages).some((p) => p !== 'HIDDEN'));
  return (
    <div className="intro">
      <div className="intro-lockup">
        <p className="intro-kicker">Ek chhota sa Diwali mohalla</p>
        <h1 className="logo-big">
          Pataka<span>.exe</span>
        </h1>
        <p className="tagline">Har ghar mein ek pataka hai.</p>
        <button
          className="btn cta"
          autoFocus
          onClick={() => {
            audio.tap();
            startAssembly();
          }}
        >
          {returning ? 'Rebuild My Diwali' : 'Build My Diwali'}
        </button>
        <div className="intro-row">
          <SoundToggle labelled />
          <button className="btn ghost small" onClick={() => setUi({ howTo: !howTo })} aria-expanded={howTo}>
            How to Play
          </button>
        </div>
      </div>
      {howTo && <HowToPlay onClose={() => setUi({ howTo: false })} />}
    </div>
  );
}
