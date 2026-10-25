// Copies album photos into the event's Google Drive folder, and takes them
// out again when the host hides or deletes them.
//
// Only photos guests can see in the album go to Drive. The event folder can
// be shared with anyone who has the link, so a photo waiting for approval,
// or one the host hid, must not be sitting in it.
import { getEvent, updateEvent, acquireLock, releaseLock } from './store';
import {
  isDriveConfigured,
  isDriveConnected,
  getConnectedEmail,
  createEventFolder,
  folderExists,
  setFolderLinkSharing,
  uploadPhotoToDrive,
  trashDriveFiles,
  folderUrl,
} from './drive';
import { getDownload, isStreamConfigured } from './stream';

// Thrown when a clip's MP4 isn't ready on Stream yet. Not a failure: the
// clip is simply tried again on the next pass.
export class NotReadyYet extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotReadyYet';
  }
}

export function isNotReady(err) {
  return err instanceof NotReadyYet || err?.name === 'NotReadyYet';
}

export async function driveReady() {
  return isDriveConfigured() && (await isDriveConnected());
}

// Sharing is on unless the host switched it off for this event.
export function shareOn(event) {
  return event.driveShare !== false;
}

// The event's folder, created (and shared, if sharing is on) on first use.
// A lock stops two simultaneous uploads each making a folder.
export async function eventFolder(event, { verify = false } = {}) {
  if (event.driveFolderId && !verify) return { id: event.driveFolderId, url: folderUrl(event.driveFolderId) };
  if (event.driveFolderId && verify && (await folderExists(event.driveFolderId))) {
    return { id: event.driveFolderId, url: folderUrl(event.driveFolderId) };
  }
  const lockName = `drivefolder:${event.slug}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await acquireLock(lockName)) {
      try {
        const fresh = await getEvent(event.slug);
        if (fresh?.driveFolderId && (!verify || (await folderExists(fresh.driveFolderId)))) {
          return { id: fresh.driveFolderId, url: folderUrl(fresh.driveFolderId) };
        }
        const folder = await createEventFolder(fresh || event);
        if (shareOn(fresh || event)) await setFolderLinkSharing(folder.id, true);
        await updateEvent(event.slug, { driveFolderId: folder.id, driveFolderUrl: folder.url });
        return folder;
      } finally {
        await releaseLock(lockName);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
    const fresh = await getEvent(event.slug);
    if (fresh?.driveFolderId) return { id: fresh.driveFolderId, url: folderUrl(fresh.driveFolderId) };
  }
  throw new Error('Timed out waiting for the Drive folder');
}

function stamp(iso) {
  // 2026-12-06 18.32.10 — sorts by time in Drive's name order.
  return String(iso || new Date().toISOString()).slice(0, 19).replace('T', ' ').replace(/:/g, '.');
}

function safe(text) {
  return String(text || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download photo (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// The files a photo becomes in Drive. An AI edit goes in as the edit plus
// the guest's original; a plain photo as itself. `buffers` lets the upload
// route pass what it already has in memory instead of downloading again.
async function filesFor(photo, buffers = {}) {
  const base = `${stamp(photo.createdAt)} - ${photo.id.slice(0, 5)}`;
  if (photo.aiLabel && photo.originalUrl) {
    return [
      { filename: `${base} - ${safe(photo.aiLabel)}.jpg`, buffer: buffers.display || (await fetchBuffer(photo.url)) },
      { filename: `${base} - original.jpg`, buffer: buffers.original || (await fetchBuffer(photo.originalUrl)) },
    ];
  }
  return [{ filename: `${base}.jpg`, buffer: buffers.display || buffers.original || (await fetchBuffer(photo.url)) }];
}

export function isVisiblePhoto(photo) {
  return photo.status !== 'pending' && photo.status !== 'hidden' && !photo.flagged;
}

// Does this photo or clip still need copying to the connected account?
export function needsArchive(photo, email) {
  if (photo.kind === 'video' && photo.processingError) return false;
  if (!isVisiblePhoto(photo)) return false;
  if (photo.syncStatus !== 'synced') return true;
  return Boolean(email && photo.driveAccount && photo.driveAccount !== email);
}

// A clip's file: the MP4 Stream makes after converting it. Waits (by
// throwing NotReadyYet) until that copy exists.
async function clipFiles(photo) {
  if (!isStreamConfigured()) throw new NotReadyYet('Cloudflare Stream is not set up');
  if (photo.ready !== true) throw new NotReadyYet('Clip still processing');
  const dl = await getDownload(photo.videoUid || photo.id);
  if (dl.status !== 'ready' || !dl.url) throw new NotReadyYet(`MP4 ${dl.status}`);
  const base = `${stamp(photo.createdAt)} - ${photo.id.slice(0, 5)}`;
  return [{ filename: `${base} - clip.mp4`, buffer: await fetchBuffer(dl.url), mimeType: 'video/mp4' }];
}

// Copies one photo or clip. Returns the fields to save on it.
export async function archivePhoto(event, photo, buffers) {
  const items = photo.kind === 'video' ? await clipFiles(photo) : await filesFor(photo, buffers);
  const folder = await eventFolder(event);
  const ids = [];
  let firstLink = null;
  for (const f of items) {
    const file = await uploadPhotoToDrive({
      folderId: folder.id,
      filename: f.filename,
      mimeType: f.mimeType || 'image/jpeg',
      buffer: f.buffer,
    });
    ids.push(file.id);
    if (!firstLink) firstLink = file.webViewLink || null;
  }
  return {
    syncStatus: 'synced',
    driveFileIds: ids,
    driveFileId: ids[0] || null,
    driveViewUrl: firstLink,
    driveAccount: await getConnectedEmail(),
  };
}

// Takes a photo's copies out of Drive (to Drive's trash). Returns the fields
// to save on the photo.
export async function unarchivePhoto(photo, nextStatus = 'removed') {
  const ids = photo.driveFileIds || (photo.driveFileId ? [photo.driveFileId] : []);
  if (ids.length && (await driveReady())) await trashDriveFiles(ids);
  return { syncStatus: nextStatus, driveFileIds: [], driveFileId: null, driveViewUrl: null };
}

export function withTimeout(promise, ms, label = 'Drive took too long') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Copies any clips in this list whose MP4 has become ready. Used while
// guests browse the album, so clips reach Drive during the event without
// anyone pressing a button. Runs at most once a minute per event and only
// spends a bounded slice of the request.
export async function archiveReadyClips(event, items, { updatePhoto, budgetMs = 15_000 } = {}) {
  if (!(await driveReady())) return 0;
  const email = await getConnectedEmail();
  const todo = items.filter((p) => p.kind === 'video' && p.ready === true && needsArchive(p, email)).slice(0, 3);
  if (!todo.length) return 0;
  if (!(await acquireLock(`clipsync:${event.slug}`, 60))) return 0;
  const startedAt = Date.now();
  let copied = 0;
  for (const clip of todo) {
    if (Date.now() - startedAt > budgetMs) break;
    try {
      const patch = await withTimeout(archivePhoto(event, clip), budgetMs);
      await updatePhoto(event.slug, clip.id, patch);
      copied += 1;
    } catch (err) {
      if (!isNotReady(err)) console.error('Clip copy to Drive failed:', clip.id, err.message);
    }
  }
  return copied;
}
