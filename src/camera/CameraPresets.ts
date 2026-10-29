import type { CameraState } from '../game/Runtime';
import { getWorld } from '../world/WorldBuilder';

export const CAMERA_DISTANCE = 90;

export const USER_LIMITS = { minPolar: 0.32, maxPolar: 1.28, minZoom: 0.72, maxZoom: 7 };

/** Responsive zoom so the whole 48 x 36 platform fits any viewport. */
export function baseZoomFor(w: number, h: number) {
  // portrait phones frame the centre of the mohalla a little tighter; they can rotate to see the rest
  return w < h ? Math.min(w / 44, h / 40) : Math.min(w / 60, h / 40);
}

export type PresetName = 'overview' | 'terrace' | 'street' | 'shop' | 'courtyard' | 'rooftops';

export const PRESET_LABELS: Record<PresetName, string> = {
  overview: 'Overview',
  terrace: 'Main Terrace',
  street: 'Street',
  shop: 'Pataka Shop',
  courtyard: 'Courtyard',
  rooftops: 'Rooftops',
};

export function getPreset(name: PresetName | 'entry'): CameraState {
  const a = getWorld().anchors;
  switch (name) {
    case 'entry':
      // what the intro's doors open onto: the gali in front of the tall cream house the rocket left from
      return { target: [-3.2, 2.0, -0.6], azimuth: 0.5, polar: 0.98, zoom: 0.84 };
    case 'terrace':
      return { target: a['family.terrace'].pos, azimuth: -0.55, polar: 0.82, zoom: 2.6 };
    case 'street':
      return { target: [a['gali.center'].pos[0], 0.9, a['gali.center'].pos[2]], azimuth: 1.25, polar: 1.08, zoom: 2.1 };
    case 'shop':
      return { target: [a['shop'].pos[0], 1.3, a['shop'].pos[2] - 0.5], azimuth: 0.12, polar: 1.02, zoom: 3.0 };
    case 'courtyard':
      return { target: a['courtyard'].pos, azimuth: 0.25, polar: 0.86, zoom: 2.6 };
    case 'rooftops':
      return { target: a['rooftops'].pos, azimuth: 0.5, polar: 0.86, zoom: 2.3 };
    case 'overview':
    default:
      return { target: [0, 1.5, 0.5], azimuth: 0.62, polar: 0.95, zoom: 1 };
  }
}
