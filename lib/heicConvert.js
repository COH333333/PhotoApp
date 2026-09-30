// Client-side photo prep, run before anything is uploaded:
//   1. HEIC/HEIF (iPhone "Keep Original") -> JPEG
//   2. Downscale to a sensible size and re-encode as JPEG
// Step 2 matters: Vercel rejects request bodies over 4.5 MB, and a full-size
// phone photo can exceed that on its own. It also makes AI edits faster.

const MAX_EDGE = 2048;
const QUALITY = 0.85;

export async function toJpegIfHeic(file) {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.heic$|\.heif$/i.test(file.name || '');

  if (!isHeic) return file;

  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg'), {
    type: 'image/jpeg',
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

// Returns a JPEG Blob no larger than MAX_EDGE on its longest side. Browsers
// apply the photo's EXIF rotation when drawing, so portraits stay upright.
export async function preparePhoto(file, { maxEdge = MAX_EDGE } = {}) {
  const jpegish = await toJpegIfHeic(file);
  const url = URL.createObjectURL(jpegish);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', QUALITY)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
