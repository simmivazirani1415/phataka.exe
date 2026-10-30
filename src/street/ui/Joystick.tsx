import { useEffect, useRef, useState } from 'react';
import { runtime } from '../../game/Runtime';
import { useGame } from '../../game/GameState';

// On-screen joystick for touch screens: push the knob to walk (up is forward).

const R = 46;

export function Joystick() {
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const album = useGame((s) => s.ui.album);
  const [touch, setTouch] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const base = useRef<HTMLDivElement>(null);
  const pid = useRef(-1);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const set = () => setTouch(mq.matches || new URLSearchParams(location.search).has('joystick'));
    set();
    mq.addEventListener?.('change', set);
    return () => mq.removeEventListener?.('change', set);
  }, []);
  useEffect(() => {
    if (active) {
      runtime.joy.x = 0;
      runtime.joy.y = 0;
      setKnob({ x: 0, y: 0 });
    }
  }, [active]);

  if (!touch || phase !== 'playing' || album) return null;
  const update = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    runtime.joy.x = dx / R;
    runtime.joy.y = dy / R;
  };
  const end = () => {
    pid.current = -1;
    setKnob({ x: 0, y: 0 });
    runtime.joy.x = 0;
    runtime.joy.y = 0;
  };
  return (
    <div
      className={`joy ${active ? 'off' : ''}`}
      ref={base}
      aria-hidden="true"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.pointerId === pid.current && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
