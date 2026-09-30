// Small, cheap versions of each photo for the album grid.
//
// Why this exists: the album shows a 3-across grid. Loading full-size photos
// there is wasteful — a guest scrolling 300 photos would pull hundreds of
// megabytes, and Vercel's free plan caps monthly transfer at 10 GB. A
// thumbnail is roughly a tenth the size, so browsing stays cheap and fast.
// The full photo still loads when someone taps one.
import sharp from 'sharp';

export const THUMB_EDGE = 480;

// Returns a JPEG buffer, or null if the image can't be read. A missing
// thumbnail is never fatal: the gallery falls back to the full photo.
export async function makeThumbnail(buffer) {
  try {
    return await sharp(buffer)
      .rotate() // honour EXIF orientation
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('Thumbnail failed:', err.message);
    return null;
  }
}
