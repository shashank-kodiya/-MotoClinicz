// Phone photos are often 3–10 MB, but the server accepts images up to 2 MB.
// This scales a large photo down in the browser (longest side 1600 px, JPEG) before it is uploaded.
// Small images, and images the browser cannot read, are returned unchanged.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 1600;

export async function shrinkImage(file, { keepPng = false } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) { bitmap.close?.(); return file; }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  // A QR code must stay sharp and keep its white background, so it can stay a PNG.
  const type = keepPng && file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && (blob.size <= MAX_UPLOAD_BYTES || quality === 0.55)) {
      const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
      return new File([blob], name, { type });
    }
  }
  return file;
}

// Shrinks the photo, then says whether it is still too big to upload.
export async function prepareUpload(file, options) {
  const ready = await shrinkImage(file, options);
  return { file: ready, tooBig: ready.size > MAX_UPLOAD_BYTES };
}
