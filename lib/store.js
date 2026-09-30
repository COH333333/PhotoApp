// Thin data-access layer over Vercel KV.
// Every event lives at key `event:{slug}`; the full list of slugs is a set
// at `events:index`; each event's photos are a list at `photos:{slug}`.
import { kv } from '@vercel/kv';
import { newAccessKey } from './access';

export async function listEvents() {
  const slugs = await kv.smembers('events:index');
  if (!slugs || slugs.length === 0) return [];
  const events = await Promise.all(slugs.map((slug) => kv.get(`event:${slug}`)));
  return events
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Events created before access keys existed get one the first time they're
// read, so old QR codes stop working and the dashboard shows the new link.
export async function getEvent(slug) {
  const event = await kv.get(`event:${slug}`);
  if (event && !event.accessKey) {
    event.accessKey = newAccessKey();
    await kv.set(`event:${slug}`, event);
  }
  return event;
}

export async function createEvent(event) {
  await kv.set(`event:${event.slug}`, event);
  await kv.sadd('events:index', event.slug);
  return event;
}

export async function updateEvent(slug, patch) {
  const existing = await kv.get(`event:${slug}`);
  if (!existing) throw new Error('Event not found');
  const updated = { ...existing, ...patch };
  await kv.set(`event:${slug}`, updated);
  return updated;
}

// Photos are stored as a hash of id -> photo under `photos:data:{slug}` with
// the ordering kept in the list `photos:{slug}` (newest first). Keeping the
// records in a hash means a single photo can be approved, hidden, or deleted
// without rewriting the whole list.
//
// Early events stored whole photo objects in the list instead. Those are
// migrated into the hash the first time the list is read.
const dataKey = (slug) => `photos:data:${slug}`;
const listKey = (slug) => `photos:${slug}`;

async function migrateLegacy(slug, entries) {
  const ids = [];
  const pipeline = kv.pipeline();
  for (const e of entries) {
    if (typeof e === 'string') {
      ids.push(e);
    } else if (e && e.id) {
      pipeline.hset(dataKey(slug), { [e.id]: e });
      ids.push(e.id);
    }
  }
  pipeline.del(listKey(slug));
  if (ids.length) pipeline.rpush(listKey(slug), ...ids);
  await pipeline.exec();
  return ids;
}

// Every photo for the event, newest first, including pending and hidden ones.
export async function listAllPhotos(slug) {
  const entries = (await kv.lrange(listKey(slug), 0, -1)) || [];
  if (entries.length === 0) return [];
  let ids = entries;
  if (entries.some((e) => typeof e !== 'string')) ids = await migrateLegacy(slug, entries);
  if (ids.length === 0) return [];
  const records = await kv.hmget(dataKey(slug), ...ids);
  return ids.map((id) => records?.[id]).filter(Boolean);
}

// Photos everyone with the album link may see.
export function isVisible(p) {
  return p.status !== 'pending' && p.status !== 'hidden';
}

// Backwards-compatible helper: visible photos, newest first.
export async function listPhotos(slug, limit = 1000) {
  const all = await listAllPhotos(slug);
  return all.filter(isVisible).slice(0, limit);
}

// A page of visible photos. `before` and `since` are createdAt timestamps:
// `before` walks back through older photos, `since` picks up new ones.
export async function pagePhotos(slug, { limit = 30, before = null, since = null, challenge = null } = {}) {
  const all = (await listAllPhotos(slug)).filter(isVisible);
  let rows = all;
  if (challenge) rows = rows.filter((p) => p.challengeId === challenge);
  if (since) rows = rows.filter((p) => p.createdAt > since);
  if (before) rows = rows.filter((p) => p.createdAt < before);
  const page = rows.slice(0, limit);
  return { photos: page, hasMore: rows.length > page.length };
}

export async function getPhoto(slug, id) {
  return kv.hget(dataKey(slug), id);
}

export async function addPhoto(slug, photo) {
  const pipeline = kv.pipeline();
  pipeline.hset(dataKey(slug), { [photo.id]: photo });
  pipeline.lpush(listKey(slug), photo.id);
  await pipeline.exec();
  return photo;
}

export async function updatePhoto(slug, id, patch) {
  const existing = await kv.hget(dataKey(slug), id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await kv.hset(dataKey(slug), { [id]: updated });
  return updated;
}

export async function removePhoto(slug, id) {
  const pipeline = kv.pipeline();
  pipeline.lrem(listKey(slug), 0, id);
  pipeline.hdel(dataKey(slug), id);
  await pipeline.exec();
}

// What anyone with the event link may see about a photo.
export function publicPhoto(p) {
  return {
    id: p.id,
    url: p.url,
    // Older photos have no thumbnail or medium copy; the grid falls back.
    thumbUrl: p.thumbUrl || null,
    mediumUrl: p.mediumUrl || null,
    originalUrl: p.originalUrl || null,
    aiLabel: p.aiLabel || null,
    guestName: p.guestName || null,
    challengeId: p.challengeId || null,
    createdAt: p.createdAt,
  };
}

// --- AI edit usage -------------------------------------------------------
// An edit is reserved *before* calling the AI and released if it fails. Both
// steps run as single Redis scripts, so simultaneous taps can't slip past a
// limit and a failure halfway can't leave the counters wrong.

const guestKey = (slug, guestId) => `ai:${slug}:guest:${guestId}`;
const eventKey = (slug) => `ai:${slug}:total`;

const RESERVE_SCRIPT = `
local total = redis.call('INCR', KEYS[1])
if total > tonumber(ARGV[2]) then
  redis.call('DECR', KEYS[1])
  return 1
end
local guest = redis.call('INCR', KEYS[2])
if guest > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[2])
  redis.call('DECR', KEYS[1])
  return 2
end
return 0`;

const RELEASE_SCRIPT = `
for _, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') > 0 then
    redis.call('DECR', key)
  end
end
return 0`;

export async function getAiUsage(slug, guestId) {
  const [guest, total] = await Promise.all([
    guestId ? kv.get(guestKey(slug, guestId)) : 0,
    kv.get(eventKey(slug)),
  ]);
  return { guest: Number(guest || 0), total: Number(total || 0) };
}

// Returns { ok: true } or { ok: false, reason: 'guest' | 'event' }.
export async function reserveAiEdit(slug, guestId, { perGuest, perEvent }) {
  const code = Number(
    await kv.eval(RESERVE_SCRIPT, [eventKey(slug), guestKey(slug, guestId)], [perGuest, perEvent])
  );
  if (code === 1) return { ok: false, reason: 'event' };
  if (code === 2) return { ok: false, reason: 'guest' };
  return { ok: true };
}

export async function releaseAiEdit(slug, guestId) {
  await kv.eval(RELEASE_SCRIPT, [eventKey(slug), guestKey(slug, guestId)], []);
}

// A finished AI edit waiting for the guest to decide whether to post it.
// Kept for a day, then dropped automatically.
export async function saveEdit(edit) {
  await kv.set(`edit:${edit.id}`, edit, { ex: 60 * 60 * 24 });
  return edit;
}

export async function getEdit(id) {
  return kv.get(`edit:${id}`);
}

// Read and remove in one step, so the same edit can't be posted twice.
export async function takeEdit(id) {
  return kv.getdel(`edit:${id}`);
}

export async function putEditBack(edit) {
  return saveEdit(edit);
}

// Short lock so simultaneous first uploads don't each create a Drive folder.
export async function acquireLock(name, seconds = 30) {
  return (await kv.set(`lock:${name}`, '1', { nx: true, ex: seconds })) === 'OK';
}

export async function releaseLock(name) {
  await kv.del(`lock:${name}`);
}

export async function getGoogleTokens() {
  return kv.get('google:tokens');
}

export async function setGoogleTokens(tokens) {
  await kv.set('google:tokens', tokens);
  return tokens;
}
