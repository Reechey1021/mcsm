// services/ai-results.js
// Send result screenshots to the admin function (which asks Gemini) and get rows back.
// Images are shrunk to ~1600 px JPEG first, so a request stays small and quick.
import { backend } from './backend.js';
import { shrinkImage } from '../ui/upload.js';

const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

export async function readResultShots(session, files, { hint } = {}) {
  const images = [];
  for (const f of files.slice(0, 6)) {
    const blob = await shrinkImage(f, { max: 1600, quality: 0.85 });
    images.push({ mime: blob.type || 'image/jpeg', data: await toBase64(blob) });
  }
  return backend.admin.call('readResults', { session, images, ...(backend.kind === 'fake' ? { hint } : {}) });
}
