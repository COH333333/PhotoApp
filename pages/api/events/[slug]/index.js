import { getEvent } from '../../../../lib/store';
import { publicPresets } from '../../../../lib/presets';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Only expose what the guest-facing page needs. Prompts and reference
  // photo URLs stay server-side.
  res.status(200).json({
    event: {
      slug: event.slug,
      name: event.name,
      date: event.date,
      primaryColor: event.primaryColor,
      accentColor: event.accentColor,
      presets: publicPresets(event),
    },
  });
}
