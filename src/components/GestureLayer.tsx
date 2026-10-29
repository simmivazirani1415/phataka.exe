import { useEffect, useRef } from 'react';
import type { PackageId } from '../assets/AssetRegistry';
import { GESTURE_INFO } from '../input/gestures';
import { getVideo, handView, startHands, stopHands, useHands } from '../input/HandTracker';
import { IconClose } from './Icons';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** Mirrored camera preview with the tracked hand drawn on top, plus the fingertip diya. */
export function GestureLayer() {
  const status = useHands((s) => s.status);
  const cursor = useHands((s) => s.cursor);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status !== 'ready') return;
    const v = getVideo();
    if (v && box.current && !box.current.contains(v)) box.current.prepend(v);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const { width: w, height: h } = c;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd15a';
      ctx.fillStyle = '#ce382a';
      for (const lm of handView.hands) {
        ctx.beginPath();
        for (const [a, b] of BONES) {
          ctx.moveTo(lm[a].x * w, lm[a].y * h);
          ctx.lineTo(lm[b].x * w, lm[b].y * h);
        }
        ctx.stroke();
        for (const p of lm) ctx.fillRect(p.x * w - 2, p.y * h - 2, 4, 4);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  if (status !== 'ready') return null;
  return (
    <>
      <div className="hand-preview" ref={box} aria-label="Camera preview for hand gestures">
        <canvas ref={canvas} width={192} height={144} />
        <button className="hand-preview-close" onClick={stopHands} aria-label="Turn off hand gestures">
          <IconClose size={14} />
        </button>
      </div>
      {cursor && <div className="hand-cursor" aria-hidden="true" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} />}
    </>
  );
}

/** Shown on an opened box: how to light it by hand, and how far along the gesture is. */
export function GesturePrompt({ id }: { id: PackageId }) {
  const status = useHands((s) => s.status);
  const progress = useHands((s) => s.progress);
  const hands = useHands((s) => s.hands);
  const info = GESTURE_INFO[id];
  if (status === 'off')
    return (
      <button className="btn ghost small gesture-start" onClick={startHands}>
        {info.icon} Light it with your hand
      </button>
    );
  if (status === 'loading') return <p className="gesture-note">Camera aur haath dhoondh rahe hain…</p>;
  if (status === 'denied' || status === 'error')
    return <p className="gesture-note">Camera isn’t available here, so tap Light It Up instead.</p>;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="gesture-prompt" role="status">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="ring-bg" />
        <circle cx="26" cy="26" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        <text x="26" y="33" textAnchor="middle" fontSize="20">
          {info.icon}
        </text>
      </svg>
      <span>
        <b>{info.title}</b>
        <small>{hands ? info.how : 'Show your hand to the camera.'}</small>
      </span>
    </div>
  );
}
