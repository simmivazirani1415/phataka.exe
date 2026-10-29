// Central ASSETS registry. Every visual has a procedural fallback; image URLs are optional
// and only ever referenced from here, never from gameplay logic.

export const PALETTE = {
  midnight: '#101A32',
  cream: '#FFF0D2',
  vermilion: '#CE382A',
  marigold: '#F5A623',
  turquoise: '#148C88',
  rani: '#D64A91',
  royal: '#3446A4',
  terracotta: '#A9573B',
  saffron: '#FFD15A',
} as const;

export type Vec3 = [number, number, number];

export type CrackerType =
  | 'bomb'
  | 'rocket'
  | 'chakri'
  | 'sparkler'
  | 'anaar'
  | 'ladi'
  | 'snake'
  | 'popPop';

export type PackageId =
  | 'bomb_wale_chacha'
  | 'rocket_bua'
  | 'chakri_dadi'
  | 'phuljhadi_mami'
  | 'anaar_maasi'
  | 'ladi_tauji'
  | 'snake_wale_nana'
  | 'pop_pop_chotu';

/** Front UV quad in BL, BR, TR, TL order (0..1). Rectangular unless the artwork is tapered. */
export type UVQuad = [[number, number], [number, number], [number, number], [number, number]];

export interface CameraFraming {
  targetOffset: Vec3; // relative to the effect anchor
  azimuth?: number; // radians; omitted = keep the current azimuth
  polar: number;
  zoom: number; // multiple of the responsive base zoom
}

export interface PackageAsset {
  id: PackageId;
  type: 'package';
  name: string;
  crackerType: CrackerType;
  crackerLabel: string;
  personality: string;
  copy: string;
  polaroidCaption: string;
  locationHint: string;
  palette: string[]; // [primary, secondary, accent, ink]
  /** Artwork. Any of these may be null; the procedural fallback draws a full box instead. */
  image: {
    front: string | null; // rectified flat front face texture
    reference: string | null; // original illustrated crop, used for stamps/thumbnails
    frontUV?: UVQuad;
  };
  proceduralFallback: string;
  /** Box proportions in world units (before scale). taper < 1 narrows the top (frustum box). */
  box: { w: number; h: number; d: number; taper: number; lid: number };
  scale: number;
  /** Named world anchor (see WorldBuilder) where the box hides; rotation comes from the anchor. */
  anchor: string;
  positionOffset: Vec3;
  zone: ZoneId;
  effectAnchor: string;
  effectCamera: CameraFraming;
  frames: number;
  fps: number;
  interaction: { hitPadding: number; focusZoom: number };
}

export type ZoneId = 'family' | 'gali' | 'shop' | 'chai' | 'rooftops' | 'courtyard';

const base = `${import.meta.env.BASE_URL}assets/pataka-packaging/`;
const RECT: UVQuad = [[0, 0], [1, 0], [1, 1], [0, 1]];

export const PACKAGES: PackageAsset[] = [
  {
    id: 'bomb_wale_chacha',
    type: 'package',
    name: 'Bomb Wale Chacha',
    crackerType: 'bomb',
    crackerLabel: 'Virtual Bomb',
    personality: 'Loudest relative at every gathering.',
    copy: 'Bada shor, badi khushi.',
    polaroidCaption: 'Poori gali ne suna.',
    locationHint: 'Somewhere behind the pataka shop counter.',
    palette: ['#C4302B', '#E3B23C', '#1F5B3A', '#2B1A12'],
    image: { front: base + 'bomb_wale_chacha_front.jpg', reference: base + 'bomb_wale_chacha.png', frontUV: RECT },
    proceduralFallback: 'bombBox',
    box: { w: 0.78, h: 1.0, d: 0.5, taper: 1, lid: 0.2 },
    scale: 1.15,
    anchor: 'shop.behindCounter',
    positionOffset: [0, 0, 0],
    zone: 'shop',
    effectAnchor: 'shop.front',
    effectCamera: { targetOffset: [0, 1.6, 0], polar: 1.05, zoom: 2.4 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.2 },
  },
  {
    id: 'rocket_bua',
    type: 'package',
    name: 'Rocket Bua',
    crackerType: 'rocket',
    crackerLabel: 'Rocket',
    personality: 'Dramatic, ambitious and always extra.',
    copy: 'Seedha aasmaan tak.',
    polaroidCaption: 'Aasmaan chhota pad gaya.',
    locationHint: 'Up on a rooftop, beside a water tank.',
    palette: ['#3446A4', '#E8702A', '#F2C14E', '#13204F'],
    image: { front: base + 'rocket_bua_front.jpg', reference: base + 'rocket_bua.png', frontUV: RECT },
    proceduralFallback: 'rocketBox',
    box: { w: 0.56, h: 1.0, d: 0.3, taper: 1, lid: 0.18 },
    scale: 1.2,
    anchor: 'n2.tankSide',
    positionOffset: [0, 0, 0],
    zone: 'rooftops',
    effectAnchor: 'n2.roofOpen',
    effectCamera: { targetOffset: [2.5, 6, 0.6], polar: 1.32, zoom: 1.35 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.0 },
  },
  {
    id: 'chakri_dadi',
    type: 'package',
    name: 'Chakri Dadi',
    crackerType: 'chakri',
    crackerLabel: 'Ground Spinner',
    personality: "Runs the family and knows everyone's business.",
    copy: 'Ghoom phir ke baat wahi.',
    polaroidCaption: 'Poore mohalle ki khabar, ek chakkar mein.',
    locationHint: 'Beside the rangoli in the quiet courtyard.',
    palette: ['#C8327F', '#F39C2B', '#138A86', '#3A1030'],
    image: { front: base + 'chakri_dadi_front.jpg', reference: base + 'chakri_dadi.png', frontUV: RECT },
    proceduralFallback: 'chakriBox',
    box: { w: 0.74, h: 0.98, d: 0.22, taper: 1, lid: 0.16 },
    scale: 1.15,
    anchor: 'courtyard.rangoliSide',
    positionOffset: [0, 0, 0],
    zone: 'courtyard',
    effectAnchor: 'courtyard.rangoli',
    effectCamera: { targetOffset: [0, 0.4, -0.6], polar: 0.95, zoom: 4.2 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.2 },
  },
  {
    id: 'phuljhadi_mami',
    type: 'package',
    name: 'Phuljhadi Mami',
    crackerType: 'sparkler',
    crackerLabel: 'Sparkler',
    personality: 'Cheerful, elegant and always ready for family photographs.',
    copy: 'Chamakte raho.',
    polaroidCaption: 'Ek aur photo, please!',
    locationHint: 'On a decorated balcony along the gali.',
    palette: ['#159A95', '#F2C531', '#EE6B5B', '#0E3B3A'],
    image: { front: base + 'phuljhadi_mami_front.jpg', reference: base + 'phuljhadi_mami.png', frontUV: RECT },
    proceduralFallback: 'sparklerBox',
    box: { w: 0.9, h: 1.0, d: 0.16, taper: 1, lid: 0.15 },
    scale: 1.05,
    anchor: 's2.balcony',
    positionOffset: [0, 0, 0],
    zone: 'gali',
    effectAnchor: 's2.balconyRail',
    effectCamera: { targetOffset: [0, 0.5, 0], polar: 1.12, zoom: 4.4 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.4 },
  },
  {
    id: 'anaar_maasi',
    type: 'package',
    name: 'Anaar Maasi',
    crackerType: 'anaar',
    crackerLabel: 'Fountain',
    personality: 'Turns every occasion into a celebration.',
    copy: 'Drama bhi, dhamaka bhi.',
    polaroidCaption: 'Har mauke ko celebration banaye.',
    locationHint: 'Behind a flowerpot on the family terrace.',
    palette: ['#D33B57', '#F28C28', '#FFF0D2', '#5A1424'],
    image: {
      front: base + 'anaar_maasi_front.jpg',
      reference: base + 'anaar_maasi.png',
      frontUV: [[0.008, 0], [0.992, 0], [0.649, 0.996], [0.317, 0.996]],
    },
    proceduralFallback: 'anaarBox',
    box: { w: 0.62, h: 1.08, d: 0.62, taper: 0.38, lid: 0.16 },
    scale: 1.15,
    anchor: 'family.terracePot',
    positionOffset: [0, 0, 0],
    zone: 'family',
    effectAnchor: 'family.terraceOpen',
    effectCamera: { targetOffset: [0, 1.5, 0], polar: 1.12, zoom: 3.0 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.0 },
  },
  {
    id: 'ladi_tauji',
    type: 'package',
    name: 'Ladi Tauji',
    crackerType: 'ladi',
    crackerLabel: 'Cracker Ladi',
    personality: 'Starts one story and never stops.',
    copy: 'Ek baar shuru, toh bas shuru.',
    polaroidCaption: 'Awaaz jo rukne na de.',
    locationHint: 'Near the main street entrance.',
    palette: ['#D8352A', '#2C4FB0', '#F6C830', '#3B0E0A'],
    image: { front: base + 'ladi_tauji_front.jpg', reference: base + 'ladi_tauji.png', frontUV: RECT },
    proceduralFallback: 'ladiBox',
    box: { w: 0.76, h: 0.98, d: 0.4, taper: 1, lid: 0.18 },
    scale: 1.15,
    anchor: 'gate.pillar',
    positionOffset: [0, 0, 0],
    zone: 'gali',
    effectAnchor: 'gali.east',
    effectCamera: { targetOffset: [0, 0.7, 0], polar: 0.98, zoom: 2.4 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.35, focusZoom: 3.2 },
  },
  {
    id: 'snake_wale_nana',
    type: 'package',
    name: 'Snake Wale Nana',
    crackerType: 'snake',
    crackerLabel: 'Magic Snake',
    personality: 'Quiet until he suddenly surprises everyone.',
    copy: 'Picture abhi baaki hai.',
    polaroidCaption: 'Dheere dheere, surprise.',
    locationHint: 'Tucked near the chai stall.',
    palette: ['#1E6B47', '#FFF0D2', '#E3A12F', '#0F2A1D'],
    image: { front: base + 'snake_wale_nana_front.jpg', reference: base + 'snake_wale_nana.png', frontUV: RECT },
    proceduralFallback: 'snakeBox',
    box: { w: 0.6, h: 0.7, d: 0.52, taper: 1, lid: 0.2 },
    scale: 1.2,
    anchor: 'chai.tucked',
    positionOffset: [0, 0, 0],
    zone: 'chai',
    effectAnchor: 'chai.front',
    effectCamera: { targetOffset: [0, 0.5, 0], polar: 0.92, zoom: 4.0 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.4, focusZoom: 3.4 },
  },
  {
    id: 'pop_pop_chotu',
    type: 'package',
    name: 'Pop-Pop Chotu',
    crackerType: 'popPop',
    crackerLabel: 'Pop-Pops',
    personality: 'Mischievous youngest family member.',
    copy: 'Chhota packet, bada surprise.',
    polaroidCaption: 'Chhote mein badi masti.',
    locationHint: 'Right next to the parked scooter.',
    palette: ['#E0458F', '#2D5BD0', '#FFD93B', '#3A0F2A'],
    image: { front: base + 'pop_pop_chotu_front.jpg', reference: base + 'pop_pop_chotu.png', frontUV: RECT },
    proceduralFallback: 'popPopBox',
    box: { w: 0.62, h: 0.72, d: 0.34, taper: 1, lid: 0.2 },
    scale: 1.15,
    anchor: 'scooter.side',
    positionOffset: [0, 0, 0],
    zone: 'gali',
    effectAnchor: 'gali.scooterRoad',
    effectCamera: { targetOffset: [0, 0.4, 0], polar: 0.95, zoom: 3.8 },
    frames: 1,
    fps: 8,
    interaction: { hitPadding: 0.4, focusZoom: 3.4 },
  },
];

export const PACKAGE_BY_ID: Record<PackageId, PackageAsset> = Object.fromEntries(
  PACKAGES.map((p) => [p.id, p]),
) as Record<PackageId, PackageAsset>;

export const PACKAGE_IDS = PACKAGES.map((p) => p.id);

// World props and characters: procedural factories referenced by name.
export interface PropAsset {
  type: 'worldProp' | 'character';
  image: string | null;
  proceduralFallback: string;
  scale: number;
  palette?: string[];
  animations?: string[];
  interaction?: { sound?: string; caption?: string[] };
}

export const PROPS: Record<string, PropAsset> = {
  scooter: { type: 'worldProp', image: null, proceduralFallback: 'scooter', scale: 1, palette: ['#148C88', '#FFF0D2'], interaction: { sound: 'horn' } },
  chaiStall: { type: 'worldProp', image: null, proceduralFallback: 'chaiStall', scale: 1, interaction: { sound: 'kettle' } },
  neighbourAunty: { type: 'character', image: null, proceduralFallback: 'neighbour', scale: 1, animations: ['idle', 'wave', 'react'] },
  balconyChild: { type: 'character', image: null, proceduralFallback: 'child', scale: 1, animations: ['idle', 'wave', 'react'], interaction: { caption: ['Ab meri baari!', 'Aur ek!', 'Dekho dekho!'] } },
  dog: { type: 'character', image: null, proceduralFallback: 'dog', scale: 1, animations: ['sleep', 'twitch'] },
};

export const DIALOGUE = {
  wow: ['Arre waah!', 'Kya baat hai!', 'Diwali wali feeling aa gayi!', 'Ekdum mast!', 'Waah ji waah!'],
  turn: ['Ab meri baari!', 'Ek aur!', 'Mujhe bhi!'],
  bomb: ['Arre baap re!', 'Kaan bajj gaye!', 'Chacha, dheere!'],
  chai: ['Chai ready hai!', 'Ek cutting?', 'Garam garam!'],
};

// ------------------------------------------------------------------------------------------
// The street cast: Simran's illustrated people and vehicles, cut out on transparent
// backgrounds (cleaned by tools/prepare_cast.py). They are drawn as upright cut-outs.
// `height` is the real height in metres; `faces` is which way the artwork looks
// (1 = to the right of the image, -1 = to the left), so the cut-out can be mirrored to
// face where it is going.

export interface CastSprite {
  id: string;
  url: string;
  height: number;
  /** width / height of the image */
  aspect: number;
  faces: 1 | -1;
}

const cast = `${import.meta.env.BASE_URL}assets/`;

export const CAST_PEOPLE: Record<'aunty' | 'boy' | 'girl' | 'uncle' | 'grandpa', CastSprite> = {
  aunty: { id: 'aunty', url: cast + 'people/aunty_diya.webp', height: 1.6, aspect: 0.523, faces: -1 },
  boy: { id: 'boy', url: cast + 'people/boy_gift.webp', height: 1.25, aspect: 0.655, faces: 1 },
  girl: { id: 'girl', url: cast + 'people/girl_marigold.webp', height: 1.35, aspect: 0.759, faces: 1 },
  uncle: { id: 'uncle', url: cast + 'people/uncle_mithai.webp', height: 1.72, aspect: 0.727, faces: 1 },
  grandpa: { id: 'grandpa', url: cast + 'people/grandpa_lantern.webp', height: 1.68, aspect: 0.575, faces: -1 },
};

export const CAST_VEHICLES: Record<'scooter' | 'bicycle' | 'auto' | 'rickshaw' | 'parkedScooter', CastSprite> = {
  scooter: { id: 'scooter', url: cast + 'vehicles/scooter_rider.webp', height: 1.75, aspect: 0.994, faces: 1 },
  bicycle: { id: 'bicycle', url: cast + 'vehicles/bicycle_girl.webp', height: 1.75, aspect: 0.975, faces: 1 },
  auto: { id: 'auto', url: cast + 'vehicles/auto.webp', height: 2.05, aspect: 1.025, faces: -1 },
  rickshaw: { id: 'rickshaw', url: cast + 'vehicles/rickshaw.webp', height: 2.1, aspect: 0.995, faces: 1 },
  parkedScooter: { id: 'parkedScooter', url: cast + 'vehicles/scooter_gifts.webp', height: 1.3, aspect: 1.012, faces: 1 },
};
