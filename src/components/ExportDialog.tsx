import { useState } from 'react';
import { useGame } from '../game/GameState';
import { downloadBlob, generateMemoryBook, PDF_FILENAME } from '../utils/PDFGenerator';
import { copyText, sharePolaroid, SHARE_TEXT } from '../utils/Share';
import { PACKAGE_BY_ID } from '../assets/AssetRegistry';
import { IconDownload, IconShare } from './Icons';

// Download the PDF scrapbook, share a Polaroid, or go back to the mohalla.

export function ExportPanel() {
  const memories = useGame((s) => s.memories);
  const packages = useGame((s) => s.packages);
  const worldPhoto = useGame((s) => s.worldPhoto);
  const setUi = useGame((s) => s.setUi);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState(0);

  const download = async () => {
    setMsg(null);
    setProgress(0);
    try {
      const blob = await generateMemoryBook({ memories, packages, worldPhoto, onProgress: setProgress });
      const saved = await downloadBlob(blob, PDF_FILENAME);
      setMsg(saved ? 'Memory book downloaded.' : 'Download cancelled.');
    } catch (e) {
      console.error(e);
      setMsg('Could not make the PDF on this device. Try saving Polaroids one by one.');
    } finally {
      setProgress(null);
    }
  };

  const share = async () => {
    const m = memories[pick];
    if (!m) return;
    const r = await sharePolaroid(m);
    if (r === 'downloaded') {
      const ok = await copyText(SHARE_TEXT);
      setMsg(ok ? 'Polaroid saved and share text copied.' : 'Polaroid saved. Share text: ' + SHARE_TEXT);
    } else if (r === 'shared') setMsg('Shared!');
  };

  return (
    <div className="export">
      <button className="btn-primary" onClick={download} disabled={progress !== null}>
        <IconDownload size={17} />
        {progress !== null ? `Making your book… ${Math.round(progress * 100)}%` : 'Download Memory Book'}
      </button>
      <div className="export-share">
        {memories.length > 0 ? (
          <>
            <label className="sr-only" htmlFor="share-pick">
              Choose a Polaroid to share
            </label>
            <select id="share-pick" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {memories.map((m, i) => (
                <option key={m.id} value={i}>
                  {PACKAGE_BY_ID[m.packageId].name}
                </option>
              ))}
            </select>
            <button className="btn-line" onClick={share}>
              <IconShare size={16} /> Share a Polaroid
            </button>
          </>
        ) : (
          <small>Light a pataka to get a Polaroid to share.</small>
        )}
      </div>
      <button className="btn-quiet" onClick={() => setUi({ album: false })}>
        Return to Mohalla
      </button>
      {msg && (
        <p className="export-msg" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
