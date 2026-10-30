import { Html } from '@react-three/drei';
import { useGame } from '../game/GameState';

// Short Hinglish speech bubbles above whoever is talking ("Arre dhyaan se!", "Waah!").

export function Bubbles() {
  const captions = useGame((s) => s.captions);
  return (
    <>
      {captions.map((c) => (
        <Html key={c.id} position={c.pos} center zIndexRange={[20, 0]} pointerEvents="none">
          <div className="bubble">{c.text}</div>
        </Html>
      ))}
    </>
  );
}
