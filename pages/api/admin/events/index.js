import { isAdminRequest } from '../../../../lib/auth';
import { listEvents, createEvent, getEvent } from '../../../../lib/store';
import { ensureEventFolder, isDriveConnected } from '../../../../lib/drive';
import { slugify } from '../../../../lib/slug';
import { DEFAULT_ENABLED } from '../../../../lib/presets';
import { AI_DEFAULTS } from '../../../../lib/aiLimits';
import { nanoid } from 'nanoid';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });

  if (req.method === 'GET') {
    const events = await listEvents();
    return res.status(200).json({ events });
  }

  if (req.method === 'POST') {
    const { name, date, primaryColor, accentColor } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Name is required' });

    let slug = slugify(name);
    const existing = await getEvent(slug);
    if (existing) slug = `${slug}-${nanoid(4).toLowerCase()}`;

    let driveFolderId = null;
    if (await isDriveConnected()) {
      try {
        driveFolderId = await ensureEventFolder(name);
      } catch (err) {
        // Event still gets created; folder can be linked later once Drive
        // is connected from /admin/setup.
        console.error('Drive folder creation failed:', err.message);
      }
    }

    const event = {
      slug,
      name,
      date: date || null,
      primaryColor: primaryColor || '#1f6f63',
      accentColor: accentColor || '#e2a73b',
      referencePhotos: [],
      aiPresets: DEFAULT_ENABLED,
      aiPerGuest: AI_DEFAULTS.perGuest,
      aiPerEvent: AI_DEFAULTS.perEvent,
      keepsakeText: '',
      driveFolderId,
      createdAt: new Date().toISOString(),
    };

    await createEvent(event);
    return res.status(201).json({ event });
  }

  res.status(405).end();
}
