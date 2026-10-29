// Copies the MediaPipe WASM runtime and the hand model into public/mediapipe so the app
// serves them itself (no third-party CDN at play time). The model is fetched once.
// It is saved with a .wasm extension only because the artifact host serves a fixed list of
// file types and .task is not one of them; MediaPipe reads the bytes either way.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const out = 'public/mediapipe';
const wasm = 'node_modules/@mediapipe/tasks-vision/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const MODEL_FILE = 'hand_landmarker_task.wasm';

mkdirSync(out, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) copyFileSync(`${wasm}/${f}`, `${out}/${f}`);
if (!existsSync(`${out}/${MODEL_FILE}`)) {
  const res = await fetch(MODEL);
  if (!res.ok) throw new Error(`Could not download the hand model: ${res.status}`);
  writeFileSync(`${out}/${MODEL_FILE}`, Buffer.from(await res.arrayBuffer()));
}
