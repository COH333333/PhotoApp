// A guest reports a photo. Once enough different guests have, the photo is
// blurred and tagged for review until the host decides.
import { getEvent, getPhoto, updatePhoto, addReport, isVisible, publicPhoto } from '../../../../../../lib/store';
import { readGuestId } from '../../../../../../lib/guest';
import { requireAccess } from '../../../../../../lib/access';
import { REPORT_THRESHOLD, makeBlurredCopyFromUrl, flagFields } from '../../../../../../lib/moderation';
import { unarchivePhoto } from '../../../../../../lib/driveArchive';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { slug, id } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;
  const guestId = readGuestId(req);
  if (!guestId) return res.status(400).json({ error: 'Reload the page and try again.' });

  const photo = await getPhoto(slug, String(id));
  if (!photo || !isVisible(photo)) return res.status(404).json({ error: 'Photo not found' });
  if (photo.flagged) return res.status(200).json({ ok: true, flagged: true });

  const count = await addReport(slug, photo.id, guestId);
  if (count < REPORT_THRESHOLD) return res.status(200).json({ ok: true, flagged: false });

  // Enough reports: blur it and take it out of the shared Drive folder.
  try {
    const source = photo.kind === 'video' ? photo.url : photo.mediumUrl || photo.url;
    const patch = flagFields({
      reason: `Reported by ${count} guests`,
      source: 'reports',
      blurUrl: await makeBlurredCopyFromUrl(slug, photo.id, source),
    });
    if (photo.syncStatus === 'synced') Object.assign(patch, await unarchivePhoto(photo, 'waiting'));
    const updated = await updatePhoto(slug, photo.id, patch);
    return res.status(200).json({ ok: true, flagged: true, photo: publicPhoto(updated) });
  } catch (err) {
    // Couldn't make the blurred copy: hide it outright rather than leave it up.
    console.error('Report blur failed, hiding photo:', err.message);
    await updatePhoto(slug, photo.id, { status: 'pending', flag: { reason: `Reported by ${count} guests`, source: 'reports', at: new Date().toISOString() } });
    return res.status(200).json({ ok: true, flagged: true, removed: true });
  }
}
