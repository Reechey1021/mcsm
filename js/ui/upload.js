// ui/upload.js
// Picking, shrinking and uploading pictures. Images are resized in the browser first, so
// storage stays tiny (an avatar is ~30 KB) and pages load fast.
import { backend } from '../services/backend.js';

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); }, { once: true });
    document.body.append(input); input.click();
  });
}

// mode 'cover' crops to the exact box (avatars); 'fit' keeps the whole image inside it.
export async function shrinkImage(file, { max = 1600, square = false, quality = 0.85 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.round(sw * scale), hgt = Math.round(sh * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, hgt);
    const blob = await new Promise((res) => c.toBlob(res, 'image/webp', quality));
    return blob && blob.type === 'image/webp' ? blob : await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

export async function uploadImage(path, file, opts) {
  const blob = await shrinkImage(file, opts);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return backend.storage.upload(`${path}-${Date.now().toString(36)}.${ext}`, blob);
}
