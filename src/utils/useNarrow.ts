import { useEffect, useState } from 'react';

/** Phone layout: the same breakpoint as the CSS (max-width: 640px). */
export const NARROW_QUERY = '(max-width: 640px)';
export const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches;

export function useNarrow() {
  const [n, setN] = useState(isNarrow);
  useEffect(() => {
    const m = window.matchMedia(NARROW_QUERY);
    const on = () => setN(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return n;
}
