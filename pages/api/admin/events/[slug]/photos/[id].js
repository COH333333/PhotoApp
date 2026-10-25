// Host moderation for a single photo: approve, hide, or delete.
import { del } from '@vercel/blob';
import { isAdminRequest } from '../../../../../../lib/auth';
import { getEvent, getPhoto, updatePhoto, removePhoto } from '../../../../../../lib/store';
import { deleteVideo } from '../../../../../../lib/stream';
import { driveReady, archivePhoto, unarchivePhoto, withTimeout, isNotReady } from '../../../../../../lib/driveArchive';

export const config = { maxDuration: 60 };

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
    const patch = { status, reviewedAt: new Date().toISOString() };
    let driveNote = null;
    try {
      if (status === 'approved' && photo.syncStatus !== 'synced' && (await driveReady())) {
        // Now visible in the album, so it goes to the (possibly shared) Drive folder.
        Object.assign(patch, await withTimeout(archivePhoto(event, { ...photo, ...patch }), 40_000));
      } else if (status !== 'approved' && photo.syncStatus === 'synced') {
        // Hidden again: take it out of the shared folder too.
        Object.assign(patch, await unarchivePhoto(photo, status === 'pending' ? 'waiting' : 'removed'));
      } else if (status !== 'approved' && photo.syncStatus !== 'synced') {
        patch.syncStatus = status === 'pending' ? 'waiting' : 'removed';
      }
    } catch (err) {
      if (isNotReady(err)) {
        // A clip whose MP4 isn't ready yet: it's copied automatically later.
        patch.syncStatus = 'waiting';
        const updated = await updatePhoto(slug, photo.id, patch);
        return res.status(200).json({ photo: updated });
      }
      console.error('Drive update on moderation failed:', err.message);
      if (status === 'approved') patch.syncStatus = 'failed';
      driveNote = "Saved, but Google Drive didn't update. Use \"Copy missing photos to Drive\" to retry.";
    }
    const updated = await updatePhoto(slug, photo.id, patch);
    return res.status(200).json({ photo: updated, driveNote });
  }

  if (req.method === 'DELETE') {
    // The Drive copy goes to Drive's trash too (recoverable there for 30
    // days): the event folder may be shared, so a deleted photo shouldn't
    // stay in it.
    await unarchivePhoto(photo).catch((err) => console.error('Drive trash failed:', err.message));
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
