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

// A mid-size copy for the lightbox and the wall. Phones on venue Wi-Fi
// shouldn't have to pull the 2048px original just to look at a photo; the
// original is still what "Save" and "Share" hand out.
export const MEDIUM_EDGE = 1600;

export async function makeMedium(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(MEDIUM_EDGE, MEDIUM_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error('Medium copy failed:', err.message);
    return null;
  }
}
