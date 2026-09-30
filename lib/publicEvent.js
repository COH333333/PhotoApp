// The slice of an event that guest pages may see. No keys, no prompts, no
// reference photos.
import { subjectFor } from './templates';

export function publicEvent(event) {
  return {
    slug: event.slug,
    name: event.name,
    date: event.date || null,
    primaryColor: event.primaryColor || '#1f6f63',
    accentColor: event.accentColor || '#e2a73b',
    coverUrl: event.coverUrl || null,
    welcome: event.welcome || '',
    hashtag: event.hashtag || '',
    subject: subjectFor(event),
    challenges: (event.challenges || []).map((c) => ({ id: c.id, text: c.text })),
  };
}
