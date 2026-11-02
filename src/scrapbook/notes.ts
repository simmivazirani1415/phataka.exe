import { create } from 'zustand';
import type { PackageId } from '../assets/AssetRegistry';

// What the player writes into the scrapbook: a message and one photo of their own per page,
// and their name on the cover. All of it stays in this browser (IndexedDB); nothing is uploaded.

export type PageKey = PackageId | 'cover';
export interface PageNote {
  message: string;
  /** a JPEG data URL, already resized and compressed */
  photo: string | null;
  savedAt: number;
}

const DB = 'phataka-party-scrapbook';
const STORE = 'pages';
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function putNote(key: PageKey, note: PageNote | null): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      if (note) tx.objectStore(STORE).put(note, key);
      else tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function allNotes(): Promise<Partial<Record<PageKey, PageNote>>> {
  const d = await db();
  if (!d) return {};
  return new Promise((resolve) => {
    try {
      const out: Partial<Record<PageKey, PageNote>> = {};
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out[c.key as PageKey] = c.value as PageNote;
        c.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve({});
    }
  });
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface NotesState {
  loaded: boolean;
  /** false when this browser cannot keep anything (private mode, storage blocked) */
  durable: boolean;
  notes: Partial<Record<PageKey, PageNote>>;
  status: Partial<Record<PageKey, SaveState>>;
  load: () => Promise<void>;
  /** changes a page right away and keeps it on this device a moment later */
  edit: (key: PageKey, patch: Partial<Omit<PageNote, 'savedAt'>>) => void;
  /** keeps the page now; resolves false if it could not be kept on this device */
  flush: (key: PageKey) => Promise<boolean>;
  clear: () => Promise<void>;
}

const timers = new Map<PageKey, number>();

export const useNotes = create<NotesState>((set, get) => ({
  loaded: false,
  durable: true,
  notes: {},
  status: {},
  load: async () => {
    if (get().loaded) return;
    const stored = await allNotes();
    // anything typed before the stored pages arrived wins
    set({ notes: { ...stored, ...get().notes }, loaded: true, durable: !!(await db()) });
  },
  edit: (key, patch) => {
    const cur = get().notes[key] ?? { message: '', photo: null, savedAt: 0 };
    set({ notes: { ...get().notes, [key]: { ...cur, ...patch } }, status: { ...get().status, [key]: 'saving' } });
    window.clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(() => void get().flush(key), 700));
  },
  flush: async (key) => {
    window.clearTimeout(timers.get(key));
    timers.delete(key);
    const n = get().notes[key];
    const empty = !n || (!n.message.trim() && !n.photo);
    const note = empty ? null : { message: n!.message, photo: n!.photo, savedAt: Date.now() };
    set({ status: { ...get().status, [key]: 'saving' } });
    const ok = await putNote(key, note);
    set({ status: { ...get().status, [key]: ok ? 'saved' : 'error' } });
    return ok;
  },
  clear: async () => {
    set({ notes: {}, status: {} });
    const d = await db();
    if (!d) return;
    try {
      d.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    } catch {
      /* ignore */
    }
  },
}));

// keep anything still waiting when the tab is hidden or closed
if (typeof window !== 'undefined') {
  const flushAll = () => timers.forEach((_t, k) => void useNotes.getState().flush(k));
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAll());
}
