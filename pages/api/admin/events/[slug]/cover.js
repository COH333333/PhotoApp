// The banner photo at the top of the guest pages and the wall.
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent } from '../../../../../lib/store';
import { parseMultipart } from '../../../../../lib/parseForm';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (req.method === 'POST') {
    let files;
    try {
      ({ files } = await parseMultipart(req));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const file = files.photo;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Wide and modest: it's a banner, not the photo itself.
    const banner = await sharp(file.buffer)
      .rotate()
      .resize(1600, 900, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const blob = await put(`covers/${slug}/${nanoid(8)}.jpg`, banner, { access: 'public', contentType: 'image/jpeg' });
    if (event.coverUrl) await del(event.coverUrl).catch(() => {});
    const updated = await updateEvent(slug, { coverUrl: blob.url });
    return res.status(201).json({ event: updated });
  }

  if (req.method === 'DELETE') {
    if (event.coverUrl) await del(event.coverUrl).catch(() => {});
    const updated = await updateEvent(slug, { coverUrl: null });
    return res.status(200).json({ event: updated });
  }

  res.status(405).end();
}
