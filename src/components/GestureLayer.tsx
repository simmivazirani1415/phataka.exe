import { useEffect, useRef } from 'react';
import type { PackageId } from '../assets/AssetRegistry';
import { GESTURE_INFO } from '../input/gestures';
import { getVideo, handView, startHands, stopHands, useHands } from '../input/HandTracker';
import { useGame } from '../game/GameState';
import { IconClose } from './Icons';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/**
 * The mirrored camera feed with the tracked hands drawn over it: the bones in gold, the
 * joints as dots, the fingertips bigger, and a fading trail behind the index tip so the
 * player sees the motion they are making. Only one is mounted at a time (the small corner
 * preview while walking, the big one on the spotlight card); it borrows the tracker's video.
 */
export function HandCam({ className, children }: { className?: string; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const status = useHands((s) => s.status);

  useEffect(() => {
    if (status !== 'ready') return;
    const v = getVideo();
    if (v && box.current && !box.current.contains(v)) box.current.prepend(v);
    let raf = 0;
    const trail: { x: number; y: number; t: number }[] = [];
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(c.clientWidth * dpr);
      const H = Math.round(c.clientHeight * dpr);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      // the video is drawn with object-fit: cover; map landmarks through the same crop
      const vid = getVideo();
      const va = vid && vid.videoHeight ? vid.videoWidth / vid.videoHeight : 4 / 3;
      const ca = W / Math.max(1, H);
      const sx = va > ca ? va / ca : 1;
      const sy = va > ca ? 1 : ca / va;
      const X = (x: number) => ((x - 0.5) * sx + 0.5) * W;
      const Y = (y: number) => ((y - 0.5) * sy + 0.5) * H;
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      const hands = handView.hands;
      if (hands[0]) trail.push({ x: hands[0][8].x, y: hands[0][8].y, t: now });
      while (trail.length && now - trail[0].t > 700) trail.shift();
      // the motion trail
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const k = 1 - (now - trail[i].t) / 700;
        ctx.strokeStyle = `rgba(255, 138, 61, ${0.85 * k})`;
        ctx.lineWidth = (2 + 6 * k) * dpr;
        ctx.beginPath();
        ctx.moveTo(X(trail[i - 1].x), Y(trail[i - 1].y));
        ctx.lineTo(X(trail[i].x), Y(trail[i].y));
        ctx.stroke();
      }
      for (const lm of hands) {
        ctx.strokeStyle = 'rgba(255, 209, 90, 0.95)';
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        for (const [p, q] of BONES) {
          ctx.moveTo(X(lm[p].x), Y(lm[p].y));
          ctx.lineTo(X(lm[q].x), Y(lm[q].y));
        }
        ctx.stroke();
        lm.forEach((pt, i) => {
          const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
          ctx.fillStyle = tip ? '#fff4e2' : '#ce382a';
          ctx.beginPath();
          ctx.arc(X(pt.x), Y(pt.y), (tip ? 4.5 : 3) * dpr, 0, Math.PI * 2);
          ctx.fill();
          if (tip) {
            ctx.strokeStyle = '#ce382a';
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();
          }
        });
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  return (
    <div className={`hand-cam ${className ?? ''}`} ref={box}>
      <canvas ref={canvas} />
      {children}
    </div>
  );
}

/** The small camera window in the corner while walking, so it is clear the hand lights crackers. */
export function GestureLayer() {
  const status = useHands((s) => s.status);
  const cursor = useHands((s) => s.cursor);
  const spot = useGame((s) => s.active?.step === 'spotlight');
  if (status !== 'ready') return null;
  return (
    <>
      {!spot && (
        <HandCam className="hand-preview">
          <span className="hand-preview-tag"><i className="dot on" /> Hand gestures</span>
          <button className="hand-preview-close" onClick={stopHands} aria-label="Turn off hand gestures">
            <IconClose size={14} />
          </button>
        </HandCam>
      )}
      {cursor && !spot && <div className="hand-cursor" aria-hidden="true" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} />}
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
