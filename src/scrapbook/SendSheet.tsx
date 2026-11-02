import { useEffect, useState } from 'react';
import { useGame } from '../game/GameState';
import { downloadBlob } from '../utils/PDFGenerator';
import { IconClose, IconDownload, IconShare } from '../components/Icons';
import { useNotes, type PageKey } from './notes';
import { canShareFiles, pageImage, shareNative, shareText, shareWhatsApp } from './exports';
import type { Format } from './render';
import { THEME_BY_ID } from './themes';

// "Send this memory": the page as a finished picture, in the shape of the place it's going.

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: 'post', label: 'Post', hint: '4:5' },
  { id: 'story', label: 'Story', hint: '9:16' },
  { id: 'x', label: 'X', hint: '16:9' },
];

export function SendSheet({ pageKey, onClose }: { pageKey: PageKey; onClose: () => void }) {
  const memories = useGame((s) => s.memories);
  const notes = useNotes((s) => s.notes);
  const flush = useNotes((s) => s.flush);
  const [format, setFormat] = useState<Format>('post');
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const who = pageKey === 'cover' ? 'the family' : THEME_BY_ID[pageKey].pkg.name;
  const text = shareText(pageKey);

  useEffect(() => {
    void flush(pageKey);
    let url = '';
    let live = true;
    setImg(null);
    setErr(null);
    pageImage(pageKey, { memories, notes }, format)
      .then(({ blob, file }) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setImg({ url, file });
      })
      .catch(() => live && setErr("Couldn't make the picture on this device. Please try again."));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, format]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const native = img ? canShareFiles(img.file) : false;
  const say = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="sb-send-sheet" role="dialog" aria-modal="true" aria-labelledby="send-title">
      <div className="sb-send-scrim" onClick={onClose} />
      <section className="sb-send-card">
        <button className="sb-x" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>
        <h3 id="send-title">Send this memory</h3>
        <p className="sb-send-sub">For {who}. Pick the shape, then send it.</p>
        <div className="sb-send-formats" role="radiogroup" aria-label="Picture shape">
          {FORMATS.map((f) => (
            <button key={f.id} role="radio" aria-checked={format === f.id} className={format === f.id ? 'on' : ''} onClick={() => setFormat(f.id)}>
              {f.label} <small>{f.hint}</small>
            </button>
          ))}
        </div>
        <div className={`sb-send-preview ${format}`}>
          {img ? <img src={img.url} alt={`Your ${who} page, ready to send`} /> : err ? <p className="sb-err">{err}</p> : <span className="sb-send-wait">Developing…</span>}
        </div>
        <div className="sb-send-acts">
          <button
            className="sb-wa"
            disabled={!img}
            onClick={async () => {
              if (!img) return;
              const r = await shareWhatsApp(img.file, text);
              if (r === 'saved-and-opened') say('Picture saved. WhatsApp is open: attach the saved picture in your chat.');
              else if (r === 'shared') say('Sent!');
            }}
          >
            WhatsApp
          </button>
          {native && (
            <button
              className="sb-line"
              disabled={!img}
              onClick={async () => {
                if (!img) return;
                const r = await shareNative(img.file, text);
                if (r === 'shared') say('Sent!');
              }}
            >
              <IconShare size={16} /> Share
            </button>
          )}
          <button
            className="sb-line"
            disabled={!img}
            onClick={async () => {
              if (!img) return;
              const ok = await downloadBlob(img.file, img.file.name);
              if (ok) say('Saved to your downloads.');
            }}
          >
            <IconDownload size={16} /> Download
          </button>
        </div>
        {msg && (
          <p className="sb-send-msg" role="status">
            {msg}
          </p>
        )}
      </section>
    </div>
  );
}
