import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PACKAGES, type PackageId } from '../assets/AssetRegistry';
import { useGame, type Memory } from '../game/GameState';
import { pickFromPanel } from '../game/DiscoverySystem';
import { audio } from '../audio/AudioEngine';
import { IconClose, IconDownload, IconLeft, IconRight } from '../components/Icons';
import { useNotes, type PageKey } from './notes';
import { THEMES, THEME_BY_ID, WASHI } from './themes';
import { latest, pageTexture, PAGE_KEYS } from './render';
import { ACCEPT, readPhoto, UploadError } from './upload';
import { exportCover, exportPages, exportPdf } from './exports';
import { SendSheet } from './SendSheet';

// The scrapbook: a cover and one page for each relative, laid out as an open book on wide
// screens (two pages a spread) and one page at a time on phones. Pages turn like paper. The
// player writes a note and adds one photo of their own on each page; it all stays on device.

const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}assets/intro/phataka_party_logo.webp`;
const LOGO_LIGHT = `${BASE}assets/intro/phataka_party_logo_light.webp`;
const FLIP_MS = 820;

/** px on the 1080-wide page design, as container units */
const u = (px: number) => `${(px / 10.8).toFixed(3)}cqw`;

function useWide() {
  const q = '(min-width: 900px) and (min-aspect-ratio: 11/10)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** wide: the endpaper (-1) and the cover, then the relatives in pairs */
const SPREADS: [number, number][] = [
  [-1, 0],
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
];
const viewOf = (page: number, wide: boolean) => (wide ? Math.ceil(page / 2) : page);
const pagesOf = (view: number, wide: boolean): number[] => (wide ? SPREADS[view] : [view]);

// ---------- pieces ----------

function Print({ memory, w, className = '', style }: { memory: Memory | null; w?: string; className?: string; style?: CSSProperties }) {
  return memory ? (
    <img className={`sb-print ${className}`} src={memory.polaroid} alt="Polaroid" draggable={false} style={{ width: w, ...style }} />
  ) : (
    <span className={`sb-print empty ${className}`} style={{ width: w, ...style }} aria-hidden="true">
      <i />
    </span>
  );
}

function Endpaper({ name }: { name: string }) {
  return (
    <div className="sb-page sb-endpaper" style={{ backgroundImage: `url(${pageTexture('endpaper')})` }}>
      <div className="sb-end-in">
        <img src={LOGO_LIGHT} alt="" draggable={false} />
        <p className="sb-end-kicker">A Diwali scrapbook</p>
        <p className="sb-end-own">This book belongs to</p>
        <p className="sb-end-name">{name || 'our family'}</p>
        <p className="sb-end-help">Every cracker you light develops a Polaroid on its relative's page. Write them a note, add a photo, then send it or keep it here.</p>
      </div>
    </div>
  );
}

function Cover({ still, go }: { still?: boolean; go: (page: number) => void }) {
  const memories = useGame((s) => s.memories);
  const note = useNotes((s) => s.notes.cover);
  const edit = useNotes((s) => s.edit);
  const [editing, setEditing] = useState(false);
  const name = note?.message ?? '';
  const n = PACKAGES.filter((p) => latest(memories, p.id)).length;
  return (
    <div className="sb-page sb-cover" style={{ backgroundImage: `url(${pageTexture('cover')})` }}>
      <span className="sb-cover-rule" aria-hidden="true" />
      <img className="sb-cover-logo" src={LOGO} alt="Phataka Party" draggable={false} />
      <p className="sb-cover-kicker">A Diwali scrapbook</p>
      {editing && !still ? (
        <input
          className="sb-cover-input"
          autoFocus
          maxLength={28}
          value={name}
          placeholder="Your family's name"
          aria-label="Whose scrapbook is this?"
          onChange={(e) => edit('cover', { message: e.target.value, photo: null })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
        />
      ) : (
        <button className="sb-cover-name" onClick={() => !still && setEditing(true)} tabIndex={still ? -1 : 0}>
          {name.trim() ? `${name.trim()}'s Phataka Memories` : 'Our Family Phataka Memories'}
          {!still && <small>{name.trim() ? 'Edit' : 'Add your name'}</small>}
        </button>
      )}
      <ul className="sb-cover-grid">
        {PACKAGES.map((p, k) => {
          const m = latest(memories, p.id);
          return (
            <li key={p.id} style={{ ['--r' as string]: `${k % 2 ? 1.6 : -1.8}deg` }}>
              <button onClick={() => go(k + 1)} tabIndex={still ? -1 : 0} aria-label={`${p.name}'s page`}>
                <span className="sb-washi" style={{ background: WASHI[k % WASHI.length] }} />
                <Print memory={m} />
                <b className={m ? '' : 'dim'}>{p.name}</b>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sb-cover-count">
        {n} Phataka {n === 1 ? 'Memory' : 'Memories'}
      </p>
      <p className="sb-cover-year">Diwali {new Date().getFullYear()}</p>
    </div>
  );
}

function RelativePage({ id, index, still }: { id: PackageId; index: number; still?: boolean }) {
  const t = THEME_BY_ID[id];
  const p = t.pkg;
  const memory = useGame((s) => latest(s.memories, id));
  const owned = useGame((s) => s.packages[id] !== 'HIDDEN');
  const note = useNotes((s) => s.notes[id]);
  const edit = useNotes((s) => s.edit);
  const setUi = useGame((s) => s.setUi);
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const L = t.left;
  const side = (px: number) => (L ? { left: u(px) } : { right: u(px) });
  const oside = (px: number) => (L ? { right: u(px) } : { left: u(px) });

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const photo = await readPhoto(f);
      edit(id, { photo, message: note?.message ?? '' });
    } catch (e) {
      setErr(e instanceof UploadError ? e.message : "That photo didn't upload. Please try again.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const light = () => {
    setUi({ album: false });
    pickFromPanel(id);
  };

  return (
    <div className={`sb-page sb-rel ${L ? 'l' : 'r'}`} style={{ backgroundImage: `url(${pageTexture(id)})`, ['--ac' as string]: t.accent, ['--ac2' as string]: t.second }}>
      <h3 className="sb-rel-name">{p.name}</h3>
      <p className="sb-rel-label">
        {p.crackerLabel} · {p.copy}
      </p>

      <figure className="sb-rel-pol" style={{ ...side(70), top: u(270), width: u(560), transform: `rotate(${t.tilt}deg)` }}>
        {t.attach === 'tape' ? <span className="sb-washi big" style={{ background: WASHI[index % WASHI.length] }} /> : <span className="sb-corners" />}
        <Print memory={memory} />
        {!memory && (
          <figcaption className="sb-rel-empty">
            <span>Not lit yet</span>
            {!still && (
              <button className="sb-mini" onClick={light}>
                {owned ? `Light ${p.crackerLabel}` : 'Collect it at the store'}
              </button>
            )}
          </figcaption>
        )}
      </figure>

      <figure className="sb-rel-pack" style={{ ...oside(80), top: u(300), width: u(300), height: u(400), transform: `rotate(${L ? 3.2 : -3.2}deg)` }}>
        <img src={p.image.front ?? p.image.reference ?? ''} alt={`${p.name} packaging`} draggable={false} />
        <span className="sb-corners accent" />
      </figure>
      <p className="sb-rel-line" style={{ ...oside(70), top: u(740), width: u(330) }}>
        “{p.polaroidCaption}”
        <small>{p.personality}</small>
      </p>

      <div className="sb-note" style={{ ...side(70), top: u(1010), width: u(650), height: u(270) }}>
        <label htmlFor={`note-${id}${still ? '-s' : ''}`}>To {t.address} &#9825;</label>
        <textarea
          id={`note-${id}${still ? '-s' : ''}`}
          value={note?.message ?? ''}
          readOnly={still}
          tabIndex={still ? -1 : 0}
          maxLength={280}
          placeholder={`Write something for ${t.address}…`}
          onChange={(e) => edit(id, { message: e.target.value, photo: note?.photo ?? null })}
        />
      </div>

      <div className="sb-own" style={{ ...oside(70), top: u(1000), width: u(260), height: u(260) }}>
        {note?.photo ? (
          <>
            <span className="sb-washi" style={{ background: WASHI[(index + 2) % WASHI.length] }} />
            <img src={note.photo} alt="Your photo" draggable={false} style={{ transform: `rotate(${L ? -3 : 3}deg)` }} />
            {!still && (
              <span className="sb-own-act">
                <button onClick={() => file.current?.click()}>Replace</button>
                <button onClick={() => edit(id, { photo: null, message: note?.message ?? '' })}>Remove</button>
              </span>
            )}
          </>
        ) : (
          <button className="sb-own-add" onClick={() => !still && file.current?.click()} tabIndex={still ? -1 : 0} disabled={busy}>
            <b>+</b>
            {busy ? 'Adding…' : 'Add your photo'}
          </button>
        )}
        {!still && <input ref={file} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />}
      </div>
      {err && !still && (
        <p className="sb-err" role="alert">
          {err}
        </p>
      )}
      <span className="sb-folio">{index + 2} / 9</span>
    </div>
  );
}

function PageAt({ page, still, go, name }: { page: number; still?: boolean; go: (p: number) => void; name: string }) {
  if (page === -1) return <Endpaper name={name} />;
  if (page === 0) return <Cover still={still} go={go} />;
  return <RelativePage id={PACKAGES[page - 1].id} index={page - 1} still={still} />;
}

function PageActions({ page, onSend }: { page: number; onSend: (k: PageKey) => void }) {
  const key = PAGE_KEYS[page];
  const flush = useNotes((s) => s.flush);
  const status = useNotes((s) => (key ? s.status[key] : undefined));
  const [kept, setKept] = useState(false);
  useEffect(() => setKept(false), [page]);
  if (page < 0 || !key) return <div className="sb-acts" />;
  return (
    <div className="sb-acts">
      <button className="sb-send" onClick={() => onSend(key)}>
        Send this memory
      </button>
      <button
        className={`sb-keep ${kept && status === 'saved' ? 'ok' : ''}`}
        onClick={async () => {
          const ok = await flush(key);
          setKept(true);
          if (ok) audio.tap();
        }}
      >
        {status === 'error' ? "Couldn't save on this device" : kept && status === 'saved' ? 'Kept in your scrapbook ✓' : status === 'saving' ? 'Saving…' : 'Keep in my scrapbook'}
      </button>
    </div>
  );
}

function DownloadMenu() {
  const memories = useGame((s) => s.memories);
  const notes = useNotes((s) => s.notes);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (label: string, fn: (p: (n: number) => void) => Promise<boolean>) => {
    setOpen(false);
    setMsg(null);
    setBusy(label);
    try {
      const ok = await fn((n) => setBusy(`${label} ${Math.round(n * 100)}%`));
      setMsg(ok ? 'Downloaded.' : 'Download cancelled.');
    } catch (e) {
      console.error(e);
      setMsg("Couldn't make the download on this device. Please try again.");
    } finally {
      setBusy(null);
      window.setTimeout(() => setMsg(null), 3500);
    }
  };
  const data = { memories, notes };
  return (
    <div className="sb-dl">
      <button className="sb-dl-btn" onClick={() => setOpen((v) => !v)} disabled={!!busy} aria-expanded={open}>
        <IconDownload size={16} /> {busy ?? 'Download'}
      </button>
      {open && (
        <ul className="sb-dl-menu" role="menu">
          <li>
            <button role="menuitem" onClick={() => run('Making PDF…', (p) => exportPdf(data, p))}>
              Scrapbook PDF <small>All 9 pages</small>
            </button>
          </li>
          <li>
            <button role="menuitem" onClick={() => run('Making pages…', (p) => exportPages(data, p))}>
              Page images <small>9 pictures, zipped</small>
            </button>
          </li>
          <li>
            <button role="menuitem" onClick={() => run('Making cover…', () => exportCover(data))}>
              Cover image <small>For a post</small>
            </button>
          </li>
        </ul>
      )}
      {msg && (
        <p className="sb-dl-msg" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

// ---------- the book ----------

export function Scrapbook() {
  const open = useGame((s) => s.ui.album);
  const startAt = useGame((s) => s.ui.bookPage);
  const setUi = useGame((s) => s.setUi);
  const memories = useGame((s) => s.memories);
  const reduced = useGame((s) => s.settings.reducedMotion);
  const load = useNotes((s) => s.load);
  const durable = useNotes((s) => s.durable);
  const name = useNotes((s) => s.notes.cover?.message?.trim() ?? '');
  const wide = useWide();
  const [view, setView] = useState(0);
  const [flip, setFlip] = useState<{ dir: 1 | -1; to: number } | null>(null);
  const [send, setSend] = useState<PageKey | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const views = wide ? SPREADS.length : 9;

  useEffect(() => {
    if (!open) return;
    void load();
    setView(viewOf(Math.max(0, Math.min(8, startAt)), wide));
    setFlip(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // keep the same page in view when the layout switches
  const prevWide = useRef(wide);
  useEffect(() => {
    if (prevWide.current === wide) return;
    const first = pagesOf(Math.min(view, prevWide.current ? SPREADS.length - 1 : 8), prevWide.current).find((p) => p >= 0) ?? 0;
    prevWide.current = wide;
    setView(viewOf(first, wide));
    setFlip(null);
  }, [wide, view]);

  const go = (to: number) => {
    to = Math.max(0, Math.min(views - 1, to));
    if (to === view || flip) return;
    audio.paper();
    if (reduced) return setView(to);
    setFlip({ dir: to > view ? 1 : -1, to });
    window.setTimeout(() => {
      setView(to);
      setFlip(null);
    }, FLIP_MS);
  };
  const goPage = (page: number) => go(viewOf(page, wide));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea');
      if (e.key === 'Escape' && !send) setUi({ album: false });
      if (typing) return;
      if (e.key === 'ArrowRight') go(view + 1);
      if (e.key === 'ArrowLeft') go(view - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cur = pagesOf(view, wide);
  const thumbsRef = useRef<HTMLOListElement>(null);
  // the strip follows the book: the open page's thumbnail scrolls into view
  useEffect(() => {
    const el = thumbsRef.current?.querySelector('button.on');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [view]);
  const curPage = cur.find((p) => p >= 0) ?? 0;
  const thumbs = useMemo(() => PACKAGES.map((p) => latest(memories, p.id)), [memories]);

  if (!open) return null;
  const close = () => setUi({ album: false });

  // what lies under the turning leaf, and what the leaf carries on each face
  let base: number[] = cur;
  let leaf: { front: number; back: number | null; cls: string } | null = null;
  if (flip) {
    const nxt = pagesOf(flip.to, wide);
    if (wide) {
      base = flip.dir > 0 ? [cur[0], nxt[1]] : [nxt[0], cur[1]];
      leaf = flip.dir > 0 ? { front: cur[1], back: nxt[0], cls: 'fwd' } : { front: cur[0], back: nxt[1], cls: 'bwd' };
    } else {
      base = nxt;
      leaf = { front: cur[0], back: null, cls: flip.dir > 0 ? 'fwd' : 'bwd' };
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('textarea, input, button')) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(view + (dx < 0 ? 1 : -1));
  };

  return (
    <div className={`sb ${wide ? 'wide' : 'narrow'}`} role="dialog" aria-modal="true" aria-label="Your scrapbook">
      <header className="sb-top">
        <div className="sb-brand">
          <img src={LOGO_LIGHT} alt="Phataka Party" draggable={false} />
          <span>A Diwali scrapbook</span>
        </div>
        <div className="sb-top-r">
          <DownloadMenu />
          <button className="sb-x" onClick={close} aria-label="Back to the mohalla">
            <IconClose size={18} />
          </button>
        </div>
      </header>

      <div className="sb-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="sb-arrow l" onClick={() => go(view - 1)} disabled={view === 0 || !!flip} aria-label="Previous page">
          <IconLeft size={20} />
        </button>
        <div className={`sb-book ${wide ? 'spread' : 'single'}`}>
          <div className="sb-pages">
            {base.map((pg, k) => (
              <PageAt key={`${pg}-${k}`} page={pg} still={!!flip} go={goPage} name={name} />
            ))}
          </div>
          {wide && <span className="sb-gutter" aria-hidden="true" />}
          {leaf && (
            <div className={`sb-leaf ${leaf.cls}`} style={{ animationDuration: `${FLIP_MS}ms` }} aria-hidden="true">
              <div className="sb-face a">
                <PageAt page={leaf.front} still go={goPage} name={name} />
                <span className="sb-shade" />
              </div>
              <div className="sb-face b">
                {leaf.back !== null ? <PageAt page={leaf.back} still go={goPage} name={name} /> : <div className="sb-page sb-blank" style={{ backgroundImage: `url(${pageTexture('cover')})` }} />}
                <span className="sb-shade" />
              </div>
            </div>
          )}
        </div>
        <button className="sb-arrow r" onClick={() => go(view + 1)} disabled={view >= views - 1 || !!flip} aria-label="Next page">
          <IconRight size={20} />
        </button>
      </div>

      <div className={`sb-actrow ${wide ? 'two' : ''}`}>
        {cur.map((pg, k) => (
          <PageActions key={`${pg}-${k}`} page={pg} onSend={setSend} />
        ))}
      </div>

      <nav className="sb-nav" aria-label="Pages">
        <span className="sb-count">
          {wide ? (cur[0] < 0 ? '1' : `${cur[0] + 1}–${cur[1] + 1}`) : curPage + 1} / 9
        </span>
        <ol className="sb-thumbs" ref={thumbsRef}>
          <li>
            <button className={cur.includes(0) ? 'on' : ''} onClick={() => goPage(0)} aria-label="Cover">
              <span className="sb-thumb-cover">
                <img src={LOGO} alt="" />
              </span>
              <b>Cover</b>
            </button>
          </li>
          {THEMES.map((t, k) => (
            <li key={t.id}>
              <button className={cur.includes(k + 1) ? 'on' : ''} onClick={() => goPage(k + 1)} aria-label={`${t.pkg.name}'s page`}>
                <Print memory={thumbs[k]} />
                <b>{t.pkg.name.replace(' Wale', '')}</b>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {!durable && <p className="sb-warn">This browser isn't keeping data, so your notes will last only until you close the tab.</p>}

      {send && <SendSheet pageKey={send} onClose={() => setSend(null)} />}
    </div>
  );
}
