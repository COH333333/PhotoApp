// The couple's own portraits, which guests can choose to pose with in the
// "Pose with us" edit. Unlike reference photos, these are shown to guests and
// become the base image the edit is built on, so pick ones you'd be happy to
// see a guest standing next to.
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent } from '../../../../../lib/store';
import { parseMultipart } from '../../../../../lib/parseForm';
import { MAX_BACKDROPS } from '../../../../../lib/presets';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const current = event.backdrops || [];

  if (req.method === 'POST') {
    if (current.length >= MAX_BACKDROPS) {
      return res.status(400).json({ error: `Up to ${MAX_BACKDROPS} portraits per event.` });
    }
    let files;
    try {
      ({ files } = await parseMultipart(req));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const file = files.photo;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const id = nanoid(10);
    const blob = await put(`backdrops/${slug}/${id}.jpg`, file.buffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    const backdrops = [...current, { id, url: blob.url }];
    const updated = await updateEvent(slug, { backdrops });
    return res.status(201).json({ event: updated });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const target = current.find((b) => b.id === id);
    if (target) {
      try {
        await del(target.url);
      } catch (err) {
        console.error('Blob delete failed:', err.message);
      }
    }
    const backdrops = current.filter((b) => b.id !== id);
    const updated = await updateEvent(slug, { backdrops });
    return res.status(200).json({ event: updated });
  }

  res.status(405).end();
}
