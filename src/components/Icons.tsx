// Small original line icons, drawn to match the hand-painted UI.
type P = { size?: number };
const S = ({ size = 22, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
