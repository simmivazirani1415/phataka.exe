import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGame } from '../game/GameState';

// Adaptive render resolution plus a gentle, one-time Low Graphics suggestion.
// Windows are long (2s) and the suggestion needs three bad windows in a row,
// so brief animation spikes never toggle quality.

export function PerformanceMonitor() {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // headless tests read draw calls and triangles from here
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__gl = gl;
  }, [gl]);
  const graphics = useGame((s) => s.settings.graphics);
  const maxDpr = graphics === 'high' ? Math.min(2, window.devicePixelRatio || 1) : Math.min(1, window.devicePixelRatio || 1);
  const minDpr = graphics === 'high' ? 1 : 0.7;
  const dpr = useRef(maxDpr);
  const win = useRef({ frames: 0, time: 0, bad: 0, suggested: false });

  useEffect(() => {
    dpr.current = maxDpr;
    setDpr(maxDpr);
  }, [maxDpr, setDpr]);

  useFrame((_, dt) => {
    const w = win.current;
    w.frames++;
    w.time += dt;
    if (w.time < 2) return;
    const fps = w.frames / w.time;
    w.frames = 0;
    w.time = 0;
    if (fps < 45 && dpr.current > minDpr) {
      dpr.current = Math.max(minDpr, dpr.current - 0.25);
      setDpr(dpr.current);
    } else if (fps > 58 && dpr.current < maxDpr) {
      dpr.current = Math.min(maxDpr, dpr.current + 0.25);
      setDpr(dpr.current);
    }
    const st = useGame.getState();
    if (st.phase === 'playing' && st.settings.graphics === 'high' && !w.suggested) {
      w.bad = fps < 28 ? w.bad + 1 : 0;
      if (w.bad >= 3) {
        w.suggested = true;
        st.setUi({ perfSuggest: true });
      }
    }
  });
  return null;
}
