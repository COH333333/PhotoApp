import { getEvent } from '../../../../lib/store';
import { publicPresets, publicBackdrops } from '../../../../lib/presets';
import { requireAccess } from '../../../../lib/access';
import { uploadsState } from '../../../../lib/eventState';
import { publicEvent } from '../../../../lib/publicEvent';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;

  // Only expose what the guest-facing page needs. Prompts and reference
  // photo URLs stay server-side.
  res.status(200).json({
    event: {
      ...publicEvent(event),
      presets: publicPresets(event),
      backdrops: publicBackdrops(event),
      uploads: uploadsState(event),
    },
  });
}
