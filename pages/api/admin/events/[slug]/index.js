import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent, listAllPhotos } from '../../../../../lib/store';
import { PRESETS } from '../../../../../lib/presets';
import { UPLOAD_MODES } from '../../../../../lib/eventState';
import { TEMPLATES } from '../../../../../lib/templates';

function clampInt(value, min, max) {
  if (value === '' || value === null) return null; // blank field: leave as is
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;

  if (req.method === 'GET') {
    const event = await getEvent(slug);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const photos = await listAllPhotos(slug);
    return res.status(200).json({ event, photos });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const patch = {};
    for (const key of ['name', 'date']) {
      if (body[key] !== undefined) patch[key] = String(body[key]).slice(0, 120);
    }
    for (const key of ['primaryColor', 'accentColor']) {
      if (typeof body[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(body[key])) patch[key] = body[key];
    }
    if (body.type !== undefined && TEMPLATES[body.type]) patch.type = body.type;
    if (body.subject !== undefined) patch.subject = String(body.subject).replace(/["`\r\n]+/g, ' ').trim().slice(0, 60);
    if (body.welcome !== undefined) patch.welcome = String(body.welcome).trim().slice(0, 240);
    if (body.hashtag !== undefined) {
      const tag = String(body.hashtag).trim().replace(/\s+/g, '').slice(0, 40);
      patch.hashtag = tag && !tag.startsWith('#') ? `#${tag}` : tag;
    }
    if (Array.isArray(body.challenges)) {
      patch.challenges = body.challenges
        .filter((c) => c && typeof c.text === 'string' && c.text.trim())
        .slice(0, 20)
        .map((c) => ({ id: /^[A-Za-z0-9_-]{4,16}$/.test(c.id || '') ? c.id : nanoid(8), text: c.text.trim().slice(0, 100) }));
    }
    if (Array.isArray(body.aiPresets)) {
      patch.aiPresets = body.aiPresets.filter((id) => PRESETS[id]);
    }
    if (body.aiPerGuest !== undefined) {
      const v = clampInt(body.aiPerGuest, 0, 50);
      if (v !== null) patch.aiPerGuest = v;
    }
    if (body.aiPerEvent !== undefined) {
      const v = clampInt(body.aiPerEvent, 0, 5000);
      if (v !== null) patch.aiPerEvent = v;
    }
    if (body.approvalMode !== undefined) {
      patch.approvalMode = Boolean(body.approvalMode);
    }
    if (body.lockCouple !== undefined) {
      patch.lockCouple = Boolean(body.lockCouple);
    }
    if (body.uploadsMode !== undefined && UPLOAD_MODES.includes(body.uploadsMode)) {
      patch.uploadsMode = body.uploadsMode;
    }
    if (body.keepsakeText !== undefined) {
      patch.keepsakeText = String(body.keepsakeText).slice(0, 80);
    }
    const event = await updateEvent(slug, patch);
    return res.status(200).json({ event });
  }

  res.status(405).end();
}
