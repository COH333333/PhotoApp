import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import {
  getEvent,
  updateEvent,
  pagePhotos,
  addPhoto,
  updatePhoto,
  publicPhoto,
  takeEdit,
  putEditBack,
  acquireLock,
  releaseLock,
} from '../../../../lib/store';
import { parseMultipart } from '../../../../lib/parseForm';
import { makeThumbnail, makeMedium } from '../../../../lib/thumbnail';
import { readGuestId } from '../../../../lib/guest';
import { requireAccess } from '../../../../lib/access';
import { uploadsOpen } from '../../../../lib/eventState';
import { driveReady, archivePhoto, archiveReadyClips, withTimeout } from '../../../../lib/driveArchive';
import { waitUntil } from '@vercel/functions';
import { refreshProcessingVideos } from '../../../../lib/videoRefresh';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

// Drive gets a bounded slice of the request. If it's slow, the photo still
// goes into the album and is marked "not in Drive" on the dashboard.
const DRIVE_BUDGET_MS = 20_000;

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download edited image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;

  if (req.method === 'GET') {
    // Paged, newest first. `before` walks back through older photos as the
    // guest scrolls; `since` fetches only what arrived after the last poll.
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));
    const before = typeof req.query.before === 'string' ? req.query.before : null;
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    const challenge = typeof req.query.challenge === 'string' ? req.query.challenge : null;
    let page = await pagePhotos(slug, { limit, before, since, challenge });
    if (await refreshProcessingVideos(slug, page.photos)) {
      page = await pagePhotos(slug, { limit, before, since, challenge });
    }
    // Copy any clips that have become ready into Drive, after the guest has
    // their answer (so browsing never waits on it).
    if (page.photos.some((p) => p.kind === 'video')) {
      waitUntil(
        archiveReadyClips(event, page.photos, { updatePhoto }).catch((err) =>
          console.error('Background clip copy failed:', err.message)
        )
      );
    }
    return res.status(200).json({ photos: page.photos.map(publicPhoto), hasMore: page.hasMore });
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (!uploadsOpen(event)) {
    return res.status(403).json({ error: 'Uploads for this event have closed. The album is still open.', closed: true });
  }

  // Body: `photo` (the guest's original, always sent) and optionally
  // `editId` (an AI edit the guest chose to post instead).
  let fields;
  let files;
  try {
    ({ fields, files } = await parseMultipart(req));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const original = files.photo;
  if (!original) return res.status(400).json({ error: 'No photo uploaded' });

  let edit = null;
  if (fields.editId) {
    edit = await takeEdit(fields.editId);
    if (!edit || edit.slug !== slug) {
      return res.status(410).json({ error: 'That edit has expired. You can post the original instead.', expired: true });
    }
    if (edit.guestId !== readGuestId(req)) {
      await putEditBack(edit);
      return res.status(403).json({ error: 'That edit belongs to someone else.' });
    }
  }

  // Optional challenge tag; must be one of the host's.
  const challenge = (event.challenges || []).find((c) => c.id === fields.challengeId) || null;

  const id = nanoid(12);
  const photo = {
    id,
    createdAt: new Date().toISOString(),
    challengeId: challenge ? challenge.id : null,
    aiPreset: edit?.preset || null,
    aiLabel: edit?.label || null,
    aiModel: edit?.model || null,
    // With approval on, a photo waits in the host's queue before it shows.
    status: event.approvalMode === true ? 'pending' : 'approved',
    driveFileId: null,
    driveViewUrl: null,
    syncStatus: 'pending',
  };
  // Kept in memory so Drive doesn't have to download them again.
  const buffers = { original: original.buffer, display: null };

  try {
    const originalBlob = await put(`photos/${slug}/${id}-original.jpg`, original.buffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    // Whatever ends up as the album's main image is what the grid shows,
    // so the thumbnail is made from that, not always the original.
    let displayBuffer = original.buffer;

    if (edit) {
      // The AI result lives on fal's CDN; copy it into our own storage.
      const editedBuffer = await fetchBuffer(edit.resultUrl);
      const editedBlob = await put(`photos/${slug}/${id}.jpg`, editedBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
      });
      photo.url = editedBlob.url;
      photo.originalUrl = originalBlob.url;
      displayBuffer = editedBuffer;
      buffers.display = editedBuffer;
    } else {
      photo.url = originalBlob.url;
    }

    // Best effort. Without them the gallery just loads the full photo.
    const [thumb, medium] = await Promise.all([makeThumbnail(displayBuffer), makeMedium(displayBuffer)]);
    const uploads = [];
    if (thumb) {
      uploads.push(
        put(`photos/${slug}/${id}-thumb.jpg`, thumb, { access: 'public', contentType: 'image/jpeg' }).then(
          (b) => (photo.thumbUrl = b.url)
        )
      );
    }
    if (medium) {
      uploads.push(
        put(`photos/${slug}/${id}-medium.jpg`, medium, { access: 'public', contentType: 'image/jpeg' }).then(
          (b) => (photo.mediumUrl = b.url)
        )
      );
    }
    await Promise.all(uploads);
  } catch (err) {
    console.error('Saving photo failed:', err.message);
    if (edit) await putEditBack(edit).catch(() => {});
    return res.status(502).json({
      error: edit
        ? "Couldn't save the edited photo. Try again, or post the original."
        : "Couldn't save your photo. Try again.",
    });
  }

  // Only photos that are visible in the album go to Drive (the folder may be
  // shared). One waiting for approval is copied when the host approves it.
  if (photo.status !== 'approved') {
    photo.syncStatus = 'waiting';
  } else if (await driveReady()) {
    try {
      Object.assign(photo, await withTimeout(archivePhoto(event, photo, buffers), DRIVE_BUDGET_MS));
    } catch (err) {
      console.error('Drive upload failed for photo', id, err.message);
      photo.syncStatus = 'failed';
    }
  }

  await addPhoto(slug, photo);

  // The locked "Pose with us" path stages its composite in our own Blob store
  // so it can be re-uploaded here. Once that's done the staged copy is dead
  // weight, and at a few hundred edits it adds up against the free tier.
  if (edit?.tempBlobUrl) {
    await del(edit.tempBlobUrl).catch((err) =>
      console.error('Could not remove staged edit blob:', err.message)
    );
  }

  return res.status(201).json({ photo: publicPhoto(photo), pending: photo.status === 'pending' });
}
