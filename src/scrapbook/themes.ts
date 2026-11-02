import { PACKAGES, type PackageAsset, type PackageId } from '../assets/AssetRegistry';

// One design system, eight personalities. Each relative's page borrows its colours from the
// cracker's own packaging and gets its own band, attachment and layout, so no two spreads
// look alike while they all read as one book.

export type Band = 'scallop' | 'bunting' | 'rays' | 'dots' | 'zigzag' | 'stripes' | 'arches' | 'confetti';
export interface Theme {
  id: PackageId;
  pkg: PackageAsset;
  /** what you call them in a note: "Bua", "Dadi" */
  address: string;
  accent: string;
  second: string;
  third: string;
  ink: string;
  band: Band;
  attach: 'tape' | 'corners';
  /** the Polaroid on the left (false: on the right) */
  left: boolean;
  tilt: number;
  /** soft page tint, mixed from the packaging */
  tint: string;
}

const BAND: Record<PackageId, Band> = {
  bomb_wale_chacha: 'stripes',
  rocket_bua: 'rays',
  chakri_dadi: 'bunting',
  phuljhadi_mami: 'dots',
  anaar_maasi: 'scallop',
  ladi_tauji: 'zigzag',
  saat_shot_nana: 'arches',
  pop_pop_chotu: 'confetti',
};
const TINT: Record<PackageId, string> = {
  bomb_wale_chacha: '#f6ecd8',
  rocket_bua: '#f2eddf',
  chakri_dadi: '#f7ead9',
  phuljhadi_mami: '#eff0e0',
  anaar_maasi: '#f7e9da',
  ladi_tauji: '#f5ebd9',
  saat_shot_nana: '#eeeedd',
  pop_pop_chotu: '#f6e9df',
};

export const THEMES: Theme[] = PACKAGES.map((p, i) => ({
  id: p.id,
  pkg: p,
  address: p.name.split(' ').slice(-1)[0],
  accent: p.palette[0],
  second: p.palette[1],
  third: p.palette[2],
  ink: '#3a1620',
  band: BAND[p.id],
  attach: i % 3 === 1 ? 'corners' : 'tape',
  left: i % 2 === 0,
  tilt: [-2.4, 2, -1.6, 2.6, -2.8, 1.8, -2, 2.4][i],
  tint: TINT[p.id],
}));
export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<PackageId, Theme>;

/** Washi tape colours, used in turn. */
export const WASHI = ['#d98a96', '#e8c45a', '#7fb3a6', '#c98872', '#9fb57a'];
