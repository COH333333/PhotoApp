// Event types. Picking one when creating an event fills in sensible
// defaults — which AI edits are on, how the guests of honour are referred
// to, colours, a welcome line, and a starter set of photo challenges. The
// host can change all of it afterwards.
//
// `subject` is how the AI prompts and the guest UI refer to the people
// being celebrated ("the couple", "the birthday girl", "the graduate"). It
// is a phrase that reads naturally after "Pose with" and "Add".

export const TEMPLATES = {
  wedding: {
    label: 'Wedding',
    subject: 'the couple',
    presets: ['pose-with-us', 'add-couple', 'add-photographer', 'fix-lighting', 'watercolor', 'anime', 'film'],
    primaryColor: '#1f6f63',
    accentColor: '#e2a73b',
    welcome: 'Thank you for celebrating with us. Add your photos and see everyone else’s as the day unfolds.',
    challenges: [
      'A photo with the couple',
      'Your table, all together',
      'The best dance move of the night',
      'Someone you just met today',
      'The moment that made you laugh',
      'Your favourite detail of the venue',
    ],
  },
  birthday: {
    label: 'Birthday',
    subject: 'the birthday star',
    presets: ['pose-with-us', 'add-photographer', 'fix-lighting', 'anime', 'film', 'keepsake'],
    primaryColor: '#7a3e9d',
    accentColor: '#f2b632',
    welcome: 'Add your photos from the party and see everyone else’s.',
    challenges: [
      'A photo with the birthday star',
      'The cake',
      'The whole group',
      'Best outfit',
      'Someone mid-laugh',
    ],
  },
  corporate: {
    label: 'Company event',
    subject: 'the team',
    presets: ['add-photographer', 'fix-lighting', 'keepsake'],
    primaryColor: '#1e3a5f',
    accentColor: '#3b9bd6',
    welcome: 'Share your photos from the event. Everything posted here is visible to attendees.',
    challenges: [
      'Your team together',
      'A colleague from another office',
      'The keynote',
      'Best moment of the day',
    ],
  },
  reunion: {
    label: 'Reunion',
    subject: 'the organisers',
    presets: ['add-photographer', 'fix-lighting', 'film', 'keepsake'],
    primaryColor: '#8a4b2c',
    accentColor: '#e0a458',
    welcome: 'It’s been a while. Add your photos and help fill the album.',
    challenges: [
      'The friend you haven’t seen the longest',
      'Then and now: recreate an old photo',
      'The whole group',
      'Someone telling a story',
    ],
  },
  babyShower: {
    label: 'Baby shower',
    subject: 'the parents-to-be',
    presets: ['pose-with-us', 'add-photographer', 'fix-lighting', 'watercolor', 'keepsake'],
    primaryColor: '#4f7c8a',
    accentColor: '#f0b7a4',
    welcome: 'Add your photos and leave a memory for the new arrival.',
    challenges: [
      'A photo with the parents-to-be',
      'The gift table',
      'Your best guess at the baby’s name',
      'The whole group',
    ],
  },
  party: {
    label: 'Party / other',
    subject: 'the hosts',
    presets: ['add-photographer', 'fix-lighting', 'film'],
    primaryColor: '#2b2d42',
    accentColor: '#ef8354',
    welcome: 'Add your photos and see everyone else’s as the night goes on.',
    challenges: ['The whole group', 'Best outfit', 'The moment that made you laugh'],
  },
};

export const DEFAULT_TEMPLATE = 'wedding';

export function templateFor(type) {
  return TEMPLATES[type] || TEMPLATES[DEFAULT_TEMPLATE];
}

// Host-editable subject, with the template's default as fallback.
export function subjectFor(event) {
  const s = String(event?.subject || '').trim();
  return s || templateFor(event?.type).subject;
}

// Public list for the "new event" form; no prompts or internals.
export function templateOptions() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, subject: t.subject }));
}
