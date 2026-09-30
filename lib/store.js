// Thin data-access layer over Vercel KV.
// Every event lives at key `event:{slug}`; the full list of slugs is a set
// at `events:index`; each event's photos are a list at `photos:{slug}`.
import { kv } from '@vercel/kv';

export async function listEvents() {
  const slugs = await kv.smembers('events:index');
  if (!slugs || slugs.length === 0) return [];
  const events = await Promise.all(slugs.map((slug) => kv.get(`event:${slug}`)));
  return events
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getEvent(slug) {
  return kv.get(`event:${slug}`);
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

// Newest first. A big wedding can pass a few hundred photos, so the default
// leaves plenty of room; the gallery lazy-loads images as you scroll.
export async function listPhotos(slug, limit = 1000) {
  const photos = await kv.lrange(`photos:${slug}`, 0, limit - 1);
  return photos || [];
}

// What anyone with the event link may see about a photo.
export function publicPhoto(p) {
  return {
    id: p.id,
    url: p.url,
    originalUrl: p.originalUrl || null,
    aiLabel: p.aiLabel || null,
    createdAt: p.createdAt,
  };
}

export async function addPhoto(slug, photo) {
  await kv.lpush(`photos:${slug}`, photo);
  return photo;
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
