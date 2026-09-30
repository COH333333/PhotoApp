// Hands a guest a copy of a photo sized for wherever they're sending it.
//
//   original  the full photo as posted
//   post      1080×1350 (Instagram feed, 4:5)
//   story     1080×1920 (Instagram/Facebook stories, 9:16)
//
// The social sizes never crop people out: the photo is fitted inside the
// frame and the space around it is filled with a blurred, darkened copy of
// itself, with the event name in the bottom margin. No AI involved, so this
// costs nothing beyond a moment of CPU.
import sharp from 'sharp';
import { getEvent, getPhoto, isVisible } from '../../../../../../lib/store';
import { requireAccess } from '../../../../../../lib/access';

export const config = { api: { responseLimit: false } };

const FRAMES = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function framed(buffer, { width, height }, caption) {
  const margin = Math.round(width * 0.06);
  const captionBand = caption ? Math.round(height * 0.06) : 0;
  const innerW = width - margin * 2;
  const innerH = height - margin * 2 - captionBand;

  // Blur a small copy and scale it up: same look as blurring at full size,
  // in a fraction of the time.
  const small = await sharp(buffer)
    .rotate()
    .resize(Math.round(width / 8), Math.round(height / 8), { fit: 'cover' })
    .blur(6)
    .modulate({ brightness: 0.55, saturation: 1.1 })
    .toBuffer();
  const background = await sharp(small).resize(width, height).toBuffer();

  const foreground = await sharp(buffer)
    .rotate()
    .resize(innerW, innerH, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  const fg = await sharp(foreground).metadata();
  const left = Math.round((width - fg.width) / 2);
  const top = Math.round(margin + (innerH - fg.height) / 2);

  const layers = [{ input: foreground, left, top }];
  if (caption) {
    const fontSize = Math.round(width * 0.03);
    const svg = Buffer.from(
      `<svg width="${width}" height="${captionBand + margin}">` +
        `<text x="${width / 2}" y="${Math.round((captionBand + margin) / 2)}" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" fill="#ffffff" ` +
        `fill-opacity="0.92" text-anchor="middle" dominant-baseline="middle">${escapeXml(caption)}</text></svg>`
    );
    layers.push({ input: svg, left: 0, top: height - captionBand - margin });
  }

  return sharp(background).composite(layers).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { slug, id } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;

  const photo = await getPhoto(slug, String(id));
  if (!photo || !isVisible(photo)) return res.status(404).json({ error: 'Photo not found' });

  const format = FRAMES[req.query.format] ? req.query.format : 'original';
  const source = await fetch(photo.url);
  if (!source.ok) return res.status(502).json({ error: 'Could not load the photo' });
  let out = Buffer.from(await source.arrayBuffer());

  if (format !== 'original') {
    const caption = event.hashtag ? `${event.name}  ·  ${event.hashtag}` : event.name;
    try {
      out = await framed(out, FRAMES[format], caption);
    } catch (err) {
      console.error('Share framing failed:', err.message);
      return res.status(500).json({ error: 'Could not prepare that size' });
    }
  }

  const filename = `${slug}-${photo.id}${format === 'original' ? '' : `-${format}`}.jpg`;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.status(200).send(out);
}
