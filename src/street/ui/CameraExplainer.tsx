import { answerCamera, useHands } from '../../input/HandTracker';
import { IconHand } from '../../components/Icons';

// Shown once, the first time the player enters a place: what the camera is for.

export function CameraExplainer() {
  const ask = useHands((s) => s.ask);
  if (!ask) return null;
  return (
    <div className="cam-ask" role="dialog" aria-modal="true" aria-labelledby="cam-ask-title">
      <section className="cam-ask-card">
        <span className="cam-ask-icon" aria-hidden="true">
          <IconHand size={30} />
        </span>
        <h2 id="cam-ask-title">Light patakas with your hand</h2>
        <p>Your camera is used only to read your hand gestures to light crackers. Nothing is recorded or uploaded.</p>
        <button className="pill-cta" autoFocus onClick={() => answerCamera(true)}>
          Turn on camera
        </button>
        <button className="cam-ask-later" onClick={() => answerCamera(false)}>
          Not now
        </button>
      </section>
    </div>
  );
}
