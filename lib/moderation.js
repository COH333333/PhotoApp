// Keeping inappropriate photos out of sight.
//
// Two ways a photo gets "tagged for review":
//   - Automatic: Google Cloud Vision's SafeSearch scans each upload (and each
//     clip's preview frame). Clearly explicit or violent images are tagged.
//   - Reported: enough different guests tap Report on it.
//
// A tagged photo stays in the album but only as a heavily blurred copy made
// here on the server, labelled "Tagged for review". Guests never receive
// the original, so the blur can't be undone in a browser. Tagged photos are
// left off the live wall and out of the Drive folder, and can't be shared,
// until the host clears them (or hides or deletes them).
import sharp from 'sharp';
import { put } from '@vercel/blob';

// Guests needed to report a photo before it's blurred. Two, so a single
// prankster can't blur photos on their own.
export const REPORT_THRESHOLD = 2;

// SafeSearch rates each category from VERY_UNLIKELY to VERY_LIKELY.
const LEVELS = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'];
const level = (v) => Math.max(0, LEVELS.indexOf(v));

// What gets a photo tagged. Wedding photos often score as "racy" (strapless
// gowns, beach shots, the dance floor), so racy alone only counts at its
// strongest and only alongside some "adult" signal.
function verdict(s) {
  if (!s) return null;
  if (level(s.adult) >= level('LIKELY')) return `explicit content (${s.adult.toLowerCase().replace('_', ' ')})`;
  if (level(s.violence) >= level('LIKELY')) return `violence or gore (${s.violence.toLowerCase().replace('_', ' ')})`;
  if (level(s.racy) >= level('VERY_LIKELY') && level(s.adult) >= level('POSSIBLE')) return 'very suggestive content';
  return null;
}

export function isScreeningOn() {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

// Returns { flag: string|null, scores } or null when screening is off or
// Vision didn't answer. Never throws: a failed check lets the photo through
// (approval mode and Report remain as the backstop) rather than blocking
// guests when Google has a hiccup.
export async function screenImage(buffer, { timeoutMs = 6000 } = {}) {
  if (!isScreeningOn()) return null;
  try {
    // A smaller copy is plenty for SafeSearch and keeps the request quick.
    const small = await sharp(buffer).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(process.env.GOOGLE_VISION_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          requests: [{ image: { content: small.toString('base64') }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
        }),
      }
    ).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.responses?.[0]?.error) {
      console.error('Vision SafeSearch failed:', res.status, JSON.stringify(data.error || data.responses?.[0]?.error || '').slice(0, 300));
      return null;
    }
    const scores = data.responses?.[0]?.safeSearchAnnotation || null;
    return { flag: verdict(scores), scores };
  } catch (err) {
    console.error('Vision SafeSearch error:', err.message);
    return null;
  }
}

export async function screenUrl(url, opts) {
  if (!isScreeningOn() || !url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return screenImage(Buffer.from(await res.arrayBuffer()), opts);
  } catch {
    return null;
  }
}

// The only version of a tagged photo guests are sent: small and blurred
// past recognition.
export async function makeBlurredCopy(slug, id, buffer) {
  const blurred = await sharp(buffer)
    .rotate()
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .blur(40)
    .modulate({ brightness: 0.9 })
    .jpeg({ quality: 60 })
    .toBuffer();
  const blob = await put(`photos/${slug}/${id}-blur.jpg`, blurred, { access: 'public', contentType: 'image/jpeg' });
  return blob.url;
}

export async function makeBlurredCopyFromUrl(slug, id, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load photo to blur (${res.status})`);
  return makeBlurredCopy(slug, id, Buffer.from(await res.arrayBuffer()));
}

// The fields that mark a photo as tagged.
export function flagFields({ reason, source, blurUrl, scores = null }) {
  return {
    flagged: true,
    flag: { reason, source, at: new Date().toISOString(), scores },
    blurUrl,
  };
}
