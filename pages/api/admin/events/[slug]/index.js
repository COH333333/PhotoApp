import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent, listPhotos } from '../../../../../lib/store';
import { PRESETS } from '../../../../../lib/presets';
import { UPLOAD_MODES } from '../../../../../lib/eventState';

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
    const photos = await listPhotos(slug);
    return res.status(200).json({ event, photos });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const patch = {};
    for (const key of ['name', 'date', 'primaryColor', 'accentColor']) {
      if (body[key] !== undefined) patch[key] = body[key];
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
