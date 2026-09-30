// Step 2: the phone says the upload finished. We look the clip up on Stream,
// turn on the MP4 download, and add it to the album. Short clips are usually
// ready to play within seconds; if not yet, the album shows it as processing
// and the photos list refreshes its state on later requests.
import { getEvent, takePendingVideo, addPhoto, publicPhoto, releaseVideo } from '../../../../../lib/store';
import { readGuestId } from '../../../../../lib/guest';
import { requireAccess } from '../../../../../lib/access';
import { getVideo, describeVideo, enableDownload, deleteVideo } from '../../../../../lib/stream';

export const config = { maxDuration: 30 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { slug, uid } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;
  if (!/^[a-f0-9]{32}$/i.test(String(uid))) return res.status(400).json({ error: 'Bad video id' });

  const pending = await takePendingVideo(uid);
  const guestId = readGuestId(req);
  if (!pending || pending.slug !== slug || pending.guestId !== guestId) {
    return res.status(403).json({ error: 'That upload has expired. Try posting the clip again.' });
  }

  // Give Stream a few seconds to finish a short clip so the guest sees it
  // playable straight away; otherwise post it as processing.
  let info = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      info = describeVideo(await getVideo(uid));
    } catch (err) {
      console.error('Stream lookup failed:', err.message);
      break;
    }
    if (info.ready || info.state === 'error') break;
    await sleep(2000);
  }
  if (!info || info.state === 'error') {
    await releaseVideo(slug, guestId).catch(() => {});
    await deleteVideo(uid).catch(() => {});
    return res.status(502).json({ error: "That clip couldn't be processed. Try recording it again." });
  }

  const downloadUrl = await enableDownload(uid).catch((err) => {
    console.error('Stream download enable failed:', err.message);
    return null;
  });

  const photo = {
    id: uid,
    kind: 'video',
    createdAt: new Date().toISOString(),
    challengeId: pending.challengeId || null,
    status: event.approvalMode === true ? 'pending' : 'approved',
    videoUid: uid,
    ready: info.ready,
    duration: info.duration,
    url: info.posterUrl,
    thumbUrl: info.thumbUrl,
    mediumUrl: info.posterUrl,
    playerUrl: info.playerUrl,
    hlsUrl: info.hlsUrl,
    downloadUrl,
    aiPreset: null,
    aiLabel: null,
    syncStatus: 'skipped', // videos aren't archived to Drive
  };
  await addPhoto(slug, photo);
  return res.status(201).json({ photo: publicPhoto(photo), pending: photo.status === 'pending' });
}
