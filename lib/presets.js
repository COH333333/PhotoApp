// The only AI edits guests can run. Guests pick a preset by id; the prompt
// itself never leaves the server, so nobody can type their own instructions.
//
// `needs` tells the guest UI what extra input a preset requires:
//   - 'references': the event must have couple reference photos uploaded
//   - 'selfie':     the guest takes a second photo (of themselves)
//
// `model` can be overridden per preset, e.g. switch 'add-couple' to
// 'fal-ai/nano-banana-pro/edit' if the fast model's likeness isn't good enough.

export const DEFAULT_MODEL = 'fal-ai/nano-banana-2/edit';

// Per-edit cost at 1K, from fal's pricing pages (checked Sept 2026). Used only
// to show a worst-case spend on the dashboard.
export const DEFAULT_COST = 0.08;
export const PRO_MODEL = 'fal-ai/nano-banana-pro/edit';
export const PRO_COST = 0.15;

// Applies to every edit. Keeps the model from "improving" guests.
export const SYSTEM_PROMPT =
  'You edit photos taken by guests at a private celebration. Keep every real person ' +
  "exactly as they are: same face, age, body shape, skin tone, hair, and clothing. Never " +
  'add, remove, or restyle people unless the instruction says to. Never add text unless ' +
  'the instruction says to. Return one finished photo.';

export const PRESETS = {
  'add-couple': {
    label: 'Add the couple',
    blurb: 'Puts the couple in your photo',
    needs: ['references'],
    // Identity matters most here, so this one preset uses the higher-quality
    // model. Roughly twice the cost; drop these two lines to go back.
    model: PRO_MODEL,
    cost: PRO_COST,
    buildPrompt: ({ referenceCount }) =>
      `Image 1 is a photo a guest took at the event. Images 2 to ${referenceCount + 1} are ` +
      'reference photos of the couple being celebrated. Add the couple into image 1 so they ' +
      'look like they were really there when it was taken: standing naturally with the people ' +
      'in the photo, at the correct scale and perspective, with lighting, shadows, color, ' +
      'focus, and grain matched to image 1. Match their faces, hair, and outfits to the ' +
      'reference photos. Keep everyone and everything already in image 1 unchanged.',
  },

  'add-photographer': {
    label: 'Add me in',
    blurb: "For the person behind the camera",
    needs: ['selfie'],
    buildPrompt: () =>
      'Image 1 is a group photo. Image 2 is a selfie of the person who took image 1. Add ' +
      'the person from image 2 into image 1 so they appear to be standing with the group, ' +
      'at the correct scale and perspective, with lighting, color, focus, and grain matched ' +
      'to image 1. Keep their face, hair, and clothing as in image 2. Keep everyone and ' +
      'everything already in image 1 unchanged.',
  },

  'fix-lighting': {
    label: 'Fix the lighting',
    blurb: 'Rescues dark or dim shots',
    needs: [],
    buildPrompt: () =>
      'Improve this dim event photo: brighten faces naturally, correct white balance, and ' +
      'reduce noise and blur. Change nothing else. Same people, faces, expressions, and ' +
      'composition.',
  },

  watercolor: {
    label: 'Watercolor',
    blurb: 'Soft painted keepsake',
    needs: [],
    buildPrompt: () =>
      'Repaint this photo as a loose, elegant watercolor painting on textured cotton paper, ' +
      'with soft washes and a few confident ink lines. Keep the same composition and poses, ' +
      'and keep every person clearly recognizable.',
  },

  lacquer: {
    label: 'Lacquer painting',
    blurb: 'Vietnamese sơn mài style',
    needs: [],
    buildPrompt: () =>
      'Repaint this photo as a traditional Vietnamese lacquer painting (sơn mài): deep black ' +
      'and cinnabar red lacquer ground, gold and silver leaf highlights, crackled eggshell ' +
      'inlay texture, and a polished glossy surface. Keep the same composition and poses, and ' +
      'keep every person clearly recognizable.',
  },

  film: {
    label: 'Disposable film',
    blurb: 'Flash, grain, and warm color',
    needs: [],
    buildPrompt: () =>
      'Make this look like it was shot on a disposable film camera with direct flash: warm ' +
      'color shift, visible film grain, slight vignette, and the soft focus of a plastic ' +
      'lens. Do not change the people or the composition.',
  },

  keepsake: {
    label: 'Keepsake frame',
    blurb: 'Adds names and date',
    needs: [],
    buildPrompt: ({ keepsakeText }) =>
      'Place this photo inside an elegant keepsake frame with a simple printed border in soft ' +
      'ivory and muted gold. In the bottom margin, add this text exactly as written, correctly ' +
      `spelled, in a refined serif typeface: "${keepsakeText}". Do not change the photo itself.`,
  },
};

export const DEFAULT_ENABLED = ['add-couple', 'add-photographer', 'fix-lighting', 'watercolor', 'film'];

// What the guest page is allowed to see about the presets.
export function publicPresets(event) {
  const enabled = event.aiPresets || DEFAULT_ENABLED;
  const hasRefs = (event.referencePhotos || []).length > 0;
  return enabled
    .filter((id) => PRESETS[id])
    .filter((id) => !PRESETS[id].needs.includes('references') || hasRefs)
    .map((id) => ({
      id,
      label: PRESETS[id].label,
      blurb: PRESETS[id].blurb,
      needsSelfie: PRESETS[id].needs.includes('selfie'),
    }));
}

// Host-supplied text goes inside a quoted prompt; strip anything that could
// break out of the quotes.
function cleanText(text) {
  return String(text).replace(/["`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Worst case per-edit cost across the presets this event has switched on.
export function maxCostFor(event) {
  const enabled = event.aiPresets || DEFAULT_ENABLED;
  const costs = enabled.filter((id) => PRESETS[id]).map((id) => PRESETS[id].cost || DEFAULT_COST);
  return costs.length ? Math.max(...costs) : DEFAULT_COST;
}

export function keepsakeTextFor(event) {
  if (event.keepsakeText) return cleanText(event.keepsakeText);
  if (!event.date) return cleanText(event.name);
  const d = new Date(`${event.date}T12:00:00`);
  const pretty = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return cleanText(`${event.name} · ${pretty}`);
}
