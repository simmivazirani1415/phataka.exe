import { create } from 'zustand';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { PackageId } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { lightPlaced } from '../game/DiscoverySystem';
import { describeHand, type Frame, type P } from './handFeatures';
import { createDetector, type Detector } from './gestures';

// Webcam hand tracking with MediaPipe Hand Landmarker, entirely on this device.
// The model and WASM runtime ship with the app (public/mediapipe) and load only when
// the player turns gestures on. While a cracker waits in the spotlight, the frames feed that
// cracker's detector, and finishing the gesture lights it exactly like a tap does.

export type HandStatus = 'off' | 'loading' | 'ready' | 'denied' | 'error';

interface HandStore {
  status: HandStatus;
  error: string | null;
  progress: number;
  /** Index fingertip of the main hand in screen fractions (0..1), mirrored. */
  cursor: { x: number; y: number } | null;
  hands: number;
}

export const useHands = create<HandStore>(() => ({ status: 'off', error: null, progress: 0, cursor: null, hands: 0 }));

/** Latest smoothed landmarks in video fractions (mirrored), for the preview skeleton. */
export const handView: { hands: P[][] } = { hands: [] };

let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let landmarker: HandLandmarker | null = null;
let raf = 0;
let lastVideoTime = -1;
let detector: { id: PackageId; d: Detector } | null = null;
let cooldownUntil = 0;
let smoothed: P[][] = [];
let lastMain: P | null = null;

const assetUrl = (p: string) => new URL(`mediapipe/${p}`, document.baseURI).href;

export function getVideo() {
  return video;
}

export async function startHands() {
  const s = useHands.getState().status;
  if (s === 'loading' || s === 'ready') return;
  useHands.setState({ status: 'loading', error: null });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser has no camera access.'), { name: 'NotSupported' });
    const camera = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const [media, lm] = await Promise.all([
      camera,
      (async () => {
        if (landmarker) return landmarker;
        const fileset = await FilesetResolver.forVisionTasks(assetUrl(''));
        const opts = { runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
        try {
          return await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: assetUrl('hand_landmarker_task.wasm'), delegate: 'GPU' }, ...opts });
        } catch {
          return await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: assetUrl('hand_landmarker_task.wasm'), delegate: 'CPU' }, ...opts });
        }
      })(),
    ]);
    landmarker = lm;
    if (useHands.getState().status !== 'loading') {
      media.getTracks().forEach((t) => t.stop()); // turned off while loading
      return;
    }
    stream = media;
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = media;
    await video.play();
    lastVideoTime = -1;
    useHands.setState({ status: 'ready' });
    raf = requestAnimationFrame(loop);
  } catch (e) {
    const err = e as Error;
    const denied = err.name === 'NotAllowedError' || err.name === 'SecurityError' || err.name === 'NotSupported' || err.name === 'NotFoundError';
    useHands.setState({ status: denied ? 'denied' : 'error', error: err.message || String(err) });
    stopStream();
  }
}

function stopStream() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
  video = null;
  smoothed = [];
  lastMain = null;
  handView.hands = [];
}

export function stopHands() {
  stopStream();
  detector = null;
  useHands.setState({ status: 'off', progress: 0, cursor: null, hands: 0 });
}

function smooth(raw: P[][]): P[][] {
  // light exponential smoothing; a hand count change restarts it
  if (raw.length !== smoothed.length) return (smoothed = raw);
  smoothed = raw.map((h, i) => h.map((p, j) => ({ x: smoothed[i][j].x * 0.4 + p.x * 0.6, y: smoothed[i][j].y * 0.4 + p.y * 0.6 })));
  return smoothed;
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!video || !landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const now = performance.now();
  let result;
  try {
    result = landmarker.detectForVideo(video, now);
  } catch {
    return;
  }
  // mirror so moving your hand right moves things right, like a mirror
  const raw = result.landmarks.map((h) => h.map((p) => ({ x: 1 - p.x, y: p.y })));
  // keep the gesturing hand first: the one nearest where it was, else the biggest (closest)
  if (raw.length > 1) {
    const size = (h: P[]) => Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y);
    const score = (h: P[]) => (lastMain ? -Math.hypot(h[0].x - lastMain.x, h[0].y - lastMain.y) : size(h));
    raw.sort((a, b) => score(b) - score(a));
  }
  lastMain = raw[0]?.[0] ?? null;
  const hands = smooth(raw);
  handView.hands = hands;
  const aspect = video.videoWidth / Math.max(1, video.videoHeight) || 4 / 3;
  const frame: Frame = { t: now / 1000, aspect, hands: hands.map((h) => describeHand(h.map((p) => ({ x: p.x * aspect, y: p.y })))) };
  const cursor = hands.length ? { x: hands[0][8].x, y: hands[0][8].y } : null;

  const a = useGame.getState().active;
  let progress = 0;
  if (a && a.step === 'spotlight' && now > cooldownUntil) {
    if (!detector || detector.id !== a.id) detector = { id: a.id, d: createDetector(a.id) };
    progress = detector.d.update(frame);
    if (progress >= 1) {
      detector.d.reset();
      cooldownUntil = now + 1500;
      void lightPlaced();
    }
  } else if (detector) {
    detector.d.reset();
    detector = null;
  }
  useHands.setState({ progress, cursor, hands: hands.length });
}
