// Couple reference photos: the photos the AI uses to put the couple into
// guests' shots. Plain photos work; no background removal needed.
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent } from '../../../../../lib/store';
import { parseMultipart } from '../../../../../lib/parseForm';

export const config = { api: { bodyParser: false } };

const MAX_REFERENCES = 6;

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const current = event.referencePhotos || [];

  if (req.method === 'POST') {
    if (current.length >= MAX_REFERENCES) {
      return res.status(400).json({ error: `Up to ${MAX_REFERENCES} reference photos per event.` });
    }
    const { files } = await parseMultipart(req);
    const file = files.photo;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const id = nanoid(10);
    // Random, unlisted URL. The AI provider fetches it; guests never see it.
    const blob = await put(`references/${slug}/${id}.jpg`, file.buffer, {
      access: 'public',
      contentType: file.mimeType || 'image/jpeg',
    });

    const referencePhotos = [...current, { id, url: blob.url }];
    const updated = await updateEvent(slug, { referencePhotos });
    return res.status(201).json({ event: updated });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const target = current.find((r) => r.id === id);
    if (target) {
      try {
        await del(target.url);
      } catch (err) {
        console.error('Blob delete failed:', err.message);
      }
    }
    const referencePhotos = current.filter((r) => r.id !== id);
    const updated = await updateEvent(slug, { referencePhotos });
    return res.status(200).json({ event: updated });
  }

  res.status(405).end();
}
