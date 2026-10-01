// Video clips, via Cloudflare Stream.
//
// Why a video service: phones record clips far bigger than a Vercel function
// may receive, iPhones record HEVC that Android and most desktops can't play,
// and Vercel's free Blob quota would be gone in an evening. Stream takes the
// upload straight from the phone, converts it, makes the poster frame, and
// plays it everywhere. It costs about $5 per 1,000 minutes stored and $1 per
// 1,000 minutes watched.
//
// Needs CF_ACCOUNT_ID and CF_STREAM_TOKEN (an API token with Stream: Edit).

const API = 'https://api.cloudflare.com/client/v4';

// Longest clip a guest may post. Enforced in the browser and by Stream itself.
export const MAX_VIDEO_SECONDS = 20;

// Stream's one-shot direct upload takes files up to 200 MB. A 20-second 4K
// clip is ~125 MB, so this leaves room.
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export function isStreamConfigured() {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_STREAM_TOKEN);
}

async function cf(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/accounts/${process.env.CF_ACCOUNT_ID}/stream${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CF_STREAM_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.errors?.map((e) => e.message).join('; ') || `Stream API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

// Asks Stream for a one-time URL the phone uploads the file to directly.
// Nothing video-sized ever passes through our own servers.
export async function createDirectUpload({ slug, guestId }) {
  const result = await cf('/direct_upload', {
    method: 'POST',
    body: {
      maxDurationSeconds: MAX_VIDEO_SECONDS + 1,
      // Cloudflare drops the upload URL after this if nobody uses it.
      expiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      meta: { name: `${slug}/${guestId}` },
      requireSignedURLs: false,
    },
  });
  return { uploadUrl: result.uploadURL, uid: result.uid };
}

// A cheap call that fails in the same ways an upload would: bad token,
// wrong account, Stream not enabled.
export async function checkStream() {
  const result = await cf('/storage-usage');
  return { videoCount: result?.videoCount ?? null, totalStorageMinutes: result?.totalStorageMinutes ?? null };
}

export async function getVideo(uid) {
  return cf(`/${uid}`);
}

export async function deleteVideo(uid) {
  try {
    await cf(`/${uid}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

// Turns on an MP4 download for a clip, so "Save / share" can hand out a real
// file. Stream builds it in the background; the URL works once it's ready.
export async function enableDownload(uid) {
  const result = await cf(`/${uid}/downloads`, { method: 'POST' });
  return result?.default?.url || null;
}

// What we keep about a clip. The playback URLs carry the account's customer
// subdomain, so the player and thumbnail addresses can be derived from them.
export function describeVideo(video) {
  const hls = video.playback?.hls || '';
  const base = hls.replace(/\/manifest\/video\.m3u8.*$/, '');
  const ready = video.readyToStream === true;
  return {
    uid: video.uid,
    ready,
    state: video.status?.state || (ready ? 'ready' : 'processing'),
    duration: typeof video.duration === 'number' && video.duration > 0 ? video.duration : null,
    hlsUrl: hls || null,
    playerUrl: base ? `${base}/iframe` : null,
    thumbUrl: base ? `${base}/thumbnails/thumbnail.jpg?time=1s&width=480&fit=crop` : null,
    posterUrl: base ? `${base}/thumbnails/thumbnail.jpg?time=1s&width=1280` : null,
  };
}
