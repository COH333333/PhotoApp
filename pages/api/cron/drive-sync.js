// Daily safety net: copies anything still missing from Drive, for every
// event, in case nobody opened the album after the last clip was ready.
// Vercel's scheduler calls this (see vercel.json) with the CRON_SECRET.
import { listEvents, listAllPhotos, updatePhoto } from '../../../lib/store';
import { getConnectedEmail } from '../../../lib/drive';
import { driveReady, archivePhoto, needsArchive, withTimeout, isNotReady } from '../../../lib/driveArchive';

export const config = { maxDuration: 60 };

const BUDGET_MS = 50_000;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not allowed' });
  }
  if (!(await driveReady())) return res.status(200).json({ skipped: 'Drive not connected' });

  const startedAt = Date.now();
  const email = await getConnectedEmail();
  let copied = 0;
  let waiting = 0;
  let failed = 0;

  for (const event of await listEvents()) {
    const todo = (await listAllPhotos(event.slug)).filter((p) => needsArchive(p, email));
    for (const photo of todo) {
      if (Date.now() - startedAt > BUDGET_MS) {
        return res.status(200).json({ copied, waiting, failed, stoppedEarly: true });
      }
      try {
        await updatePhoto(event.slug, photo.id, await withTimeout(archivePhoto(event, photo), 25_000));
        copied += 1;
      } catch (err) {
        if (isNotReady(err)) waiting += 1;
        else {
          failed += 1;
          console.error('Daily Drive copy failed:', event.slug, photo.id, err.message);
        }
      }
    }
  }
  return res.status(200).json({ copied, waiting, failed });
}
