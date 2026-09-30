// Host moderation for a single photo: approve, hide, or delete.
import { del } from '@vercel/blob';
import { isAdminRequest } from '../../../../../../lib/auth';
import { getEvent, getPhoto, updatePhoto, removePhoto } from '../../../../../../lib/store';
import { deleteVideo } from '../../../../../../lib/stream';

const STATUSES = ['approved', 'hidden', 'pending'];

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug, id } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const photo = await getPhoto(slug, String(id));
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  if (req.method === 'PATCH') {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const updated = await updatePhoto(slug, photo.id, { status, reviewedAt: new Date().toISOString() });
    return res.status(200).json({ photo: updated });
  }

  if (req.method === 'DELETE') {
    // The Drive copy, if any, is left alone: that's the host's archive.
    if (photo.kind === 'video') {
      await deleteVideo(photo.videoUid || photo.id).catch((err) => console.error('Stream delete failed:', err.message));
    } else {
      const urls = [photo.url, photo.originalUrl, photo.thumbUrl, photo.mediumUrl].filter(Boolean);
      await Promise.all(
        urls.map((u) => del(u).catch((err) => console.error('Blob delete failed:', err.message)))
      );
    }
    await removePhoto(slug, photo.id);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
