// Step 1 of posting a clip: the phone asks for somewhere to upload it.
// We reserve a slot, ask Cloudflare Stream for a one-time upload URL, and
// remember who asked. The file itself goes phone → Cloudflare.
import { getEvent, reserveVideo, releaseVideo, savePendingVideo } from '../../../../../lib/store';
import { readGuestId } from '../../../../../lib/guest';
import { requireAccess } from '../../../../../lib/access';
import { uploadsOpen } from '../../../../../lib/eventState';
import { isStreamConfigured, createDirectUpload, MAX_VIDEO_SECONDS, MAX_VIDEO_BYTES } from '../../../../../lib/stream';
import { videoLimitsFor } from '../../../../../lib/aiLimits';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;
  if (!uploadsOpen(event)) return res.status(403).json({ error: 'Uploads for this event have closed.', closed: true });
  if (!isStreamConfigured() || event.videosEnabled === false) {
    return res.status(503).json({ error: 'Videos are not on for this event.' });
  }
  const guestId = readGuestId(req);
  if (!guestId) return res.status(400).json({ error: 'Reload the page and try again.' });

  const { challengeId, size } = req.body || {};
  if (Number(size) > MAX_VIDEO_BYTES) {
    return res.status(413).json({ error: `That clip is too big. Keep it under ${MAX_VIDEO_SECONDS} seconds.` });
  }
  const challenge = (event.challenges || []).find((c) => c.id === challengeId) || null;

  const limits = videoLimitsFor(event);
  const reservation = await reserveVideo(slug, guestId, limits);
  if (!reservation.ok) {
    return res.status(429).json({
      error:
        reservation.reason === 'guest'
          ? `You've posted the most clips one guest can (${limits.perGuest}). Photos are still open.`
          : 'This event has reached its video limit. Photos are still open.',
    });
  }

  try {
    const { uploadUrl, uid } = await createDirectUpload({ slug, guestId });
    await savePendingVideo(uid, {
      slug,
      guestId,
      challengeId: challenge ? challenge.id : null,
      createdAt: new Date().toISOString(),
    });
    return res.status(200).json({ uploadUrl, uid, maxSeconds: MAX_VIDEO_SECONDS });
  } catch (err) {
    console.error('Stream direct upload failed:', err.message);
    await releaseVideo(slug, guestId).catch(() => {});
    return res.status(502).json({ error: "Couldn't start the video upload. Try again." });
  }
}
