// Small original line icons with one consistent stroke weight.
type P = { size?: number };
const S = ({ size = 22, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconSoundOn = (p: P) => (
  <S {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </S>
);
export const IconSoundOff = (p: P) => (
  <S {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </S>
);
export const IconCamera = (p: P) => (
  <S {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </S>
);
export const IconAlbum = (p: P) => (
  <S {...p}>
    <rect x="4" y="3" width="15" height="18" rx="1.5" />
    <path d="M8 3v18" />
    <rect x="10.5" y="7" width="6" height="5" rx="0.5" />
  </S>
);
export const IconSettings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </S>
);
export const IconHint = (p: P) => (
  <S {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </S>
);
export const IconViews = (p: P) => (
  <S {...p}>
    <path d="M3 7l9-4 9 4-9 4z" />
    <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
  </S>
);
export const IconMore = (p: P) => (
  <S {...p}>
    <circle cx="5" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="19" cy="12" r="1.3" />
  </S>
);
export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IconBox = (p: P) => (
  <S {...p}>
    <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
    <path d="M4 8l8 4 8-4M12 12v8" />
  </S>
);
export const IconLeft = (p: P) => (
  <S {...p}>
    <path d="M15 5l-7 7 7 7" />
  </S>
);
export const IconRight = (p: P) => (
  <S {...p}>
    <path d="M9 5l7 7-7 7" />
  </S>
);
export const IconTurnLeft = (p: P) => (
  <S {...p}>
    <path d="M20 13a8 8 0 0 1-14.6 4.5" />
    <path d="M4 11a8 8 0 0 1 14.6-4.5" />
    <path d="M4 5v6h6" />
  </S>
);
export const IconTurnRight = (p: P) => (
  <S {...p}>
    <path d="M4 13a8 8 0 0 0 14.6 4.5" />
    <path d="M20 11a8 8 0 0 0-14.6-4.5" />
    <path d="M20 5v6h-6" />
  </S>
);
export const IconPin = (p: P) => (
  <S {...p}>
    <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </S>
);
export const IconCracker = (p: P) => (
  <S {...p}>
    <path d="M7 20l3.5-11h3L17 20z" />
    <path d="M8.6 15h6.8" />
    <path d="M12 9V6.5c0-1.4 1-2.2 2.2-2.5" />
    <path d="M16.5 2.8l.6 1.2M18.8 4.4l-1.2.5M18.3 1.9l-.9.9" />
  </S>
);
export const IconGrid = (p: P) => (
  <S {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
  </S>
);
export const IconChevron = (p: P) => (
  <S {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </S>
);
export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </S>
);
export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </S>
);
export const IconHand = (p: P) => (
  <S {...p}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-2.6 0-4.1-1.3-5.4-3.4L3.4 14.8a1.5 1.5 0 0 1 2.4-1.8L8 15" />
  </S>
);
export const IconMonitor = (p: P) => (
  <S {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
    <path d="M9 20h6M12 16.5V20" />
  </S>
);
export const IconEye = (p: P) => (
  <S {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </S>
);
export const IconBolt = (p: P) => (
  <S {...p}>
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />
  </S>
);
export const IconReplay = (p: P) => (
  <S {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4.5v4h4" />
    <path d="M10.5 9.2v5.6l4.3-2.8z" />
  </S>
);
export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M4.5 7h15M10 7V5h4v2M6.5 7l1 13h9l1-13" />
  </S>
);
export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </S>
);
export const IconShare = (p: P) => (
  <S {...p}>
    <path d="M12 15V4M8 7.5L12 3.5l4 4" />
    <path d="M7 11H5.5v9h13v-9H17" />
  </S>
);
export const IconArrow = (p: P) => (
  <S {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </S>
);
