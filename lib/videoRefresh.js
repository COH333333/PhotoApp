// Clips posted before Stream finished converting them are stored as not
// ready. Whenever the album is listed, any such clips in view are checked
// again — at most once every 15 seconds per event, so a busy album doesn't
// hammer the Stream API. Returns true if anything changed.
import { updatePhoto, acquireLock } from './store';
import { getVideo, describeVideo, isStreamConfigured } from './stream';

export async function refreshProcessingVideos(slug, photos) {
  if (!isStreamConfigured()) return false;
  const stale = photos.filter((p) => p.kind === 'video' && p.ready !== true).slice(0, 10);
  if (stale.length === 0) return false;
  if (!(await acquireLock(`videorefresh:${slug}`, 15))) return false;

  let changed = false;
  for (const p of stale) {
    try {
      const info = describeVideo(await getVideo(p.videoUid || p.id));
      if (info.ready) {
        await updatePhoto(slug, p.id, {
          ready: true,
          duration: info.duration,
          url: info.posterUrl,
          thumbUrl: info.thumbUrl,
          mediumUrl: info.posterUrl,
          playerUrl: info.playerUrl,
          hlsUrl: info.hlsUrl,
        });
        changed = true;
      } else if (info.state === 'error') {
        await updatePhoto(slug, p.id, { status: 'hidden', ready: false, processingError: true });
        changed = true;
      }
    } catch (err) {
      console.error('Video refresh failed:', err.message);
    }
  }
  return changed;
}
