// Clips posted before Stream finished converting them are stored as not
// ready. Whenever the album is listed, any such clips in view are checked
// again — at most once every 15 seconds per event, so a busy album doesn't
// hammer the Stream API. Returns true if anything changed.
import { updatePhoto, acquireLock } from './store';
import { getVideo, describeVideo, isStreamConfigured } from './stream';
import { screenUrl, makeBlurredCopyFromUrl, flagFields } from './moderation';

// A clip is screened by its preview frame once Stream has made one. Returns
// the fields to add if it should be tagged for review.
export async function screenClip(slug, id, posterUrl) {
  const screen = await screenUrl(posterUrl);
  if (!screen?.flag) return {};
  try {
    return flagFields({
      reason: `Automatic check of the clip's preview frame: ${screen.flag}`,
      source: 'auto',
      scores: screen.scores,
      blurUrl: await makeBlurredCopyFromUrl(slug, id, posterUrl),
    });
  } catch (err) {
    console.error('Clip blur failed, holding clip:', err.message);
    return { status: 'pending' };
  }
}

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
          ...(await screenClip(slug, p.id, info.posterUrl)),
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
