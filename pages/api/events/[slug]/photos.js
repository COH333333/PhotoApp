import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import {
  getEvent,
  updateEvent,
  pagePhotos,
  addPhoto,
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
import { ensureEventFolder, uploadPhotoToDrive, isDriveConnected } from '../../../../lib/drive';
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

async function driveFolderFor(event) {
  if (event.driveFolderId) return event.driveFolderId;
  const lockName = `drivefolder:${event.slug}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await acquireLock(lockName)) {
      try {
        const fresh = await getEvent(event.slug);
        if (fresh?.driveFolderId) return fresh.driveFolderId;
        const folderId = await ensureEventFolder(event.name);
        await updateEvent(event.slug, { driveFolderId: folderId });
        return folderId;
      } finally {
        await releaseLock(lockName);
      }
    }
    // Someone else is creating it; wait and re-check.
    await new Promise((r) => setTimeout(r, 1000));
    const fresh = await getEvent(event.slug);
    if (fresh?.driveFolderId) return fresh.driveFolderId;
  }
  throw new Error('Timed out waiting for the Drive folder');
}

async function archiveToDrive(event, files) {
  if (!(await isDriveConnected())) return { status: 'pending' };
  const folderId = await driveFolderFor(event);
  let first = null;
  for (const f of files) {
    const driveFile = await uploadPhotoToDrive({ folderId, ...f });
    if (!first) first = driveFile;
  }
  return { status: 'synced', driveFileId: first.id, driveViewUrl: first.webViewLink };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Drive upload took too long')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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
    // With approval on, a photo waits in the host's queue before it shows.
    status: event.approvalMode === true ? 'pending' : 'approved',
    driveFileId: null,
    driveViewUrl: null,
    syncStatus: 'pending',
  };
  const driveFiles = [];

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
      driveFiles.push({ filename: `${id} - ${edit.label}.jpg`, mimeType: 'image/jpeg', buffer: editedBuffer });
    } else {
      photo.url = originalBlob.url;
    }
    driveFiles.push({
      filename: edit ? `${id} - original.jpg` : `${id}.jpg`,
      mimeType: 'image/jpeg',
      buffer: original.buffer,
    });

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

  try {
    const drive = await withTimeout(archiveToDrive(event, driveFiles), DRIVE_BUDGET_MS);
    photo.syncStatus = drive.status;
    photo.driveFileId = drive.driveFileId || null;
    photo.driveViewUrl = drive.driveViewUrl || null;
  } catch (err) {
    console.error('Drive upload failed for photo', id, err.message);
    photo.syncStatus = 'failed';
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
