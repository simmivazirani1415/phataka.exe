import { useEffect, useMemo, useState } from 'react';
import { PACKAGES, PACKAGE_BY_ID } from '../assets/AssetRegistry';
import { getThumbUrl } from '../assets/PackageTextures';
import { useGame, type Memory } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { PolaroidImage } from './PolaroidCard';
import { ExportPanel } from './ExportDialog';
import { IconClose, IconLeft, IconRight } from './Icons';
import { audio } from '../audio/AudioEngine';
import { formatDate } from '../utils/PolaroidRenderer';
import { SITE } from '../config/site';

type Page = { kind: 'cover' } | { kind: 'world' } | { kind: 'collection' } | { kind: 'photos'; items: Memory[] } | { kind: 'end' } | { kind: 'empty' };

function useWide() {
  const q = '(min-width: 900px) and (min-aspect-ratio: 5/4)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function Stamp({ id, tilt = 0 }: { id: (typeof PACKAGES)[number]['id']; tilt?: number }) {
  const p = PACKAGE_BY_ID[id];
  return (
    <span className="stamp" style={{ ['--pk' as string]: p.palette[0], transform: `rotate(${tilt}deg)` }}>
      <img src={getThumbUrl(id)} alt="" />
    </span>
  );
}

function PageView({ page, index }: { page: Page; index: number }) {
  const memories = useGame((s) => s.memories);
  const packages = useGame((s) => s.packages);
  const worldPhoto = useGame((s) => s.worldPhoto);
  const found = PACKAGES.filter((p) => packages[p.id] !== 'HIDDEN');
  switch (page.kind) {
    case 'cover':
      return (
        <div className="page cover">
          <p className="cover-kicker">{SITE.name} · Diwali {new Date().getFullYear()}</p>
          <h2>
            My Diwali,
            <br />
            my mohalla
          </h2>
          <p className="cover-sub">A little collection of big memories.</p>
          <div className="cover-stamps">
            {found.slice(0, 4).map((p, i) => (
              <Stamp key={p.id} id={p.id} tilt={[-5, 4, -3, 6][i]} />
            ))}
          </div>
        </div>
      );
    case 'world':
      return (
        <div className="page world">
          <h3 className="page-title">Hamara Mohalla</h3>
          {worldPhoto ? <img className="print" src={worldPhoto} alt="The whole mohalla, photographed from above" /> : <p className="hand muted">Photo develop ho rahi hai…</p>}
          <p className="hand">
            {found.length} of 8 patakas found · {memories.length} {memories.length === 1 ? 'memory' : 'memories'} made
          </p>
        </div>
      );
    case 'collection':
      return (
        <div className="page collection">
          <h3 className="page-title">The Pataka Parivaar</h3>
          <ul className="label-grid">
            {PACKAGES.map((p) =>
              packages[p.id] !== 'HIDDEN' ? (
                <li key={p.id}>
                  <Stamp id={p.id} tilt={(p.name.length % 5) - 2} />
                  <b>{p.name}</b>
                  <small className="hand">“{p.copy}”</small>
                </li>
              ) : (
                <li key={p.id} className="missing">
                  <span className="stamp ghost" />
                  <small className="hand">Agli Diwali…</small>
                </li>
              ),
            )}
          </ul>
        </div>
      );
    case 'photos':
      return (
        <div className={`page photos n${page.items.length}`}>
          {page.items.map((m, i) => (
            <figure key={m.id} style={{ transform: `rotate(${(i % 2 ? 2.2 : -2.6) + (index % 3) * 0.6}deg)` }}>
              <span className="tape" />
              <PolaroidImage memory={m} />
              <figcaption className="hand">
                {PACKAGE_BY_ID[m.packageId].personality} <small>{formatDate(m.createdAt)}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      );
    case 'empty':
      return (
        <div className="page photos empty">
          <p className="hand">Abhi koi photo nahi. Light a pataka to make your first memory.</p>
        </div>
      );
    case 'end':
      return (
        <div className="page end">
          <h3>
            Patake toh khatam ho gaye.
            <br />
            <span>Yaadein nahi.</span>
          </h3>
          <p className="cover-sub">Keep this Diwali as a little book, or send one Polaroid to someone.</p>
        </div>
      );
  }
}

export function MemoryAlbum() {
  const open = useGame((s) => s.ui.album);
  const memories = useGame((s) => s.memories);
  const setUi = useGame((s) => s.setUi);
  const setWorldPhoto = useGame((s) => s.setWorldPhoto);
  const wide = useWide();
  const [i, setI] = useState(0);

  const pages = useMemo<Page[]>(() => {
    const per = 2;
    const photoPages: Page[] = [];
    for (let k = 0; k < memories.length; k += per) photoPages.push({ kind: 'photos', items: memories.slice(k, k + per) });
    return [{ kind: 'cover' }, { kind: 'world' }, { kind: 'collection' }, ...(photoPages.length ? photoPages : [{ kind: 'empty' } as Page]), { kind: 'end' }];
  }, [memories]);

  useEffect(() => {
    if (!open) return;
    setI(0);
    runtime.capture?.overview().then((url) => url && setWorldPhoto(url));
  }, [open, setWorldPhoto]);

  const step = wide ? 2 : 1;
  const last = wide ? Math.max(0, pages.length - (pages.length % 2 === 0 ? 2 : 1)) : pages.length - 1;
  const go = (d: number) => {
    audio.paper();
    setI((v) => Math.max(0, Math.min(last, v + d * step)));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  const shown = wide ? [pages[i], pages[i + 1]].filter(Boolean) : [pages[i]];
  return (
    <div className="album-backdrop" role="dialog" aria-label="Memory album" onClick={(e) => e.target === e.currentTarget && setUi({ album: false })}>
      <div className={`album ${wide ? 'spread' : 'single'}`}>
        <button className="icon-btn album-close" onClick={() => setUi({ album: false })} aria-label="Return to mohalla">
          <IconClose size={18} />
        </button>
        <div className="album-pages" key={i}>
          {shown.map((p, k) => (
            <PageView key={k} page={p} index={i + k} />
          ))}
        </div>
        <ExportPanel />
        <nav className="album-nav">
          <button className="icon-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous page">
            <IconLeft size={18} />
          </button>
          <span>
            {i + 1}
            {wide && shown.length > 1 ? `–${i + 2}` : ''} / {pages.length}
          </span>
          <button className="icon-btn" onClick={() => go(1)} disabled={i >= last} aria-label="Next page">
            <IconRight size={18} />
          </button>
        </nav>
      </div>
    </div>
  );
}
