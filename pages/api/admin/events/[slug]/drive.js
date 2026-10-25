// Google Drive for one event. Host-only.
//
//   GET                     status: folder link, sharing, photos still to copy
//   POST { action: 'sync' } make sure the folder exists (and its sharing
//                           matches the setting), then copy up to a few
//                           photos that aren't in Drive yet. The dashboard
//                           calls this repeatedly until nothing is left.
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, listAllPhotos, updatePhoto } from '../../../../../lib/store';
import { getConnectedEmail, setFolderLinkSharing } from '../../../../../lib/drive';
import { driveReady, eventFolder, archivePhoto, needsArchive, shareOn, withTimeout, isNotReady } from '../../../../../lib/driveArchive';

export const config = { maxDuration: 60 };

// Stop starting new copies after this much of the request has gone.
const BUDGET_MS = 40_000;

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!(await driveReady())) return res.status(400).json({ error: 'Connect Google Drive first.' });

  const email = await getConnectedEmail();
  const photos = await listAllPhotos(slug);
  const todo = photos.filter((p) => needsArchive(p, email));

  if (req.method === 'GET') {
    return res.status(200).json({
      folderUrl: event.driveFolderUrl || null,
      shared: shareOn(event),
      remaining: todo.length,
    });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const startedAt = Date.now();

  let folder;
  try {
    folder = await eventFolder(event, { verify: true });
    await setFolderLinkSharing(folder.id, shareOn(event));
  } catch (err) {
    console.error('Drive folder setup failed:', err.message);
    return res.status(502).json({ error: `Couldn't set up the Drive folder: ${err.message}` });
  }

  const fresh = await getEvent(slug);
  let copied = 0;
  let notReady = 0;
  const failed = [];
  // Photos first: clips may still be waiting on Cloudflare's MP4.
  const ordered = [...todo].sort((a, b) => (a.kind === 'video') - (b.kind === 'video'));
  for (const photo of ordered) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    try {
      const patch = await withTimeout(archivePhoto(fresh, photo), 30_000);
      await updatePhoto(slug, photo.id, patch);
      copied += 1;
    } catch (err) {
      if (isNotReady(err)) {
        notReady += 1;
        continue;
      }
      console.error('Drive copy failed for', photo.id, err.message);
      failed.push(photo.id);
      await updatePhoto(slug, photo.id, { syncStatus: 'failed' });
      if (failed.length >= 3) break; // something's wrong; don't burn the whole request
    }
  }

  return res.status(200).json({
    folderUrl: folder.url,
    shared: shareOn(fresh),
    copied,
    failed: failed.length,
    notReady,
    remaining: Math.max(0, todo.length - copied),
  });
}
