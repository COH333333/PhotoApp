// The only AI edits guests can run. Guests pick a preset by id; the prompt
// itself never leaves the server, so nobody can type their own instructions.
//
// `needs` tells the guest UI what extra input a preset requires:
//   - 'references': the event must have couple reference photos uploaded
//   - 'selfie':     the guest takes a second photo (of themselves)
//   - 'backdrop':   the guest picks one of the couple's own portraits, which
//                   becomes the base image the edit is built on
//
// `model` can be overridden per preset, e.g. switch 'add-couple' to
// 'fal-ai/nano-banana-pro/edit' if the fast model's likeness isn't good enough.

import { subjectFor } from './templates';

export const DEFAULT_MODEL = 'fal-ai/nano-banana-2/edit';

// Per-edit cost at 1K, from fal's pricing pages (checked Sept 2026). Used only
// to show a worst-case spend on the dashboard.
export const DEFAULT_COST = 0.08;
export const PRO_MODEL = 'fal-ai/nano-banana-pro/edit';
export const PRO_COST = 0.15;

// How many portraits a guest can choose between.
export const MAX_BACKDROPS = 8;

// Applies to every edit. Keeps the model from "improving" guests.
export const SYSTEM_PROMPT =
  'You edit photos taken by guests at a private celebration. Keep every real person ' +
  "exactly as they are: same face, age, body shape, skin tone, hair, and clothing. Never " +
  'add, remove, or restyle people unless the instruction says to. When an instruction does ' +
  'ask you to add people, add only the specific people it identifies — never invent extra ' +
  'figures, bystanders, or a crowd to fill space. Never add text unless the instruction says ' +
  'to. Return one finished photo.';

export const PRESETS = {
  'add-couple': {
    label: (subject) => `Add ${subject}`,
    blurb: (subject) => `Puts ${subject} in your photo`,
    needs: ['references'],
    // Tried Nano Banana Pro here (Sept 30) on the theory that the better model
    // would hold likeness more tightly. It did the opposite: it ignored the
    // reference photos and generated a generic couple. Standard Nano Banana 2
    // follows the references properly, so this preset stays on it.
    buildPrompt: ({ referenceCount, subject }) =>
      `Image 1 is a photo a guest took at the event. Images 2 to ${referenceCount + 1} are ` +
      `reference photos of ${subject} being celebrated. Add ${subject} from the reference photos ` +
      'into image 1 so they look like they were really there when it was taken: standing ' +
      'naturally with the people in the photo, at the correct scale and perspective, with ' +
      'lighting, shadows, color, focus, and grain matched to image 1. Match their faces, hair, ' +
      'and outfits to the reference photos, and add only the people shown in the reference ' +
      'photos. Keep everyone and everything already in image 1 unchanged.',
  },

  // The reverse of 'add-couple'. There, the guest's photo is the base and the
  // couple has to be synthesised from references, so any error lands on the
  // faces that matter most. Here the couple's own portrait is the base and is
  // preserved exactly; the guest is the one being drawn in. A guest forgives an
  // approximate version of themselves far more readily than the couple forgives
  // an approximate version of them.
  'pose-with-us': {
    label: (subject) => `Pose with ${subject}`,
    blurb: (subject) => `Join one of ${subject === 'us' ? 'our' : `${subject}'s`} portraits`,
    needs: ['backdrop'],
    // With the canvas padded, the model is drawing into space that already
    // exists rather than being asked to make room, and the couple's half is
    // composited back afterwards anyway.
    lockedResolution: '2K',
    lockedCost: 0.12,
    buildLockedPrompt: ({ subject }) =>
      `Image 1 is a professional photograph of ${subject} with an area of empty space ` +
      'added along its right-hand edge. Image 2 is a photograph of the guest or guests ' +
      'to add; it may be a close-up showing only one person. Count the people in image 2 and add ' +
      'exactly that many people to image 1 — the same number, the same people, and nobody else. ' +
      'Do not invent additional guests, a crowd, or any bystanders, and do not fill the empty ' +
      `area with people. Place them standing in the empty space beside ${subject}, as though ` +
      'they had posed together: at the correct scale and perspective for the scene, with the ' +
      'lighting, color, focus, and grain of the photograph, and with the floor, walls, and ' +
      "background continued naturally into the empty area. Give each person a natural standing " +
      'pose and a full body, even where image 2 shows only a head and shoulders. Keep every ' +
      'face, hair, skin tone, and item of clothing exactly as in image 2. Keep them entirely ' +
      `within the empty area and clear of ${subject}. Do not alter the part of image 1 that ` +
      `already contains ${subject}: their faces, poses, outfits, and background must stay ` +
      'exactly as they are. If the empty area is larger than the guests need, leave the rest of ' +
      'it as empty room.',
    buildPrompt: ({ subject }) =>
      `Image 1 is a professional photograph of ${subject}. Image 2 is a photograph of ` +
      'the guest or guests to add; it may be a close-up showing only one person. Count ' +
      'the people in image 2 and add exactly that many people to image 1 — the same number, the ' +
      'same people, and nobody else. Do not invent additional guests, a crowd, or any ' +
      `bystanders. Place them standing beside ${subject} on the same ground and in the same ` +
      'setting, as though they had all posed together, at the correct scale and perspective, ' +
      'with the lighting, shadows, color, focus, and grain of image 1. Give each person a ' +
      'natural standing pose and a full body, even where image 2 shows only a head and ' +
      'shoulders. Keep every face, hair, skin tone, and item of clothing exactly as in image 2. ' +
      `Do not change ${subject} in any way: their faces, poses, outfits, and the background of ` +
      'image 1 must stay exactly as they are. Widen the scene only as much as is needed to fit ' +
      'the guests in.',
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

  anime: {
    label: 'Hand-painted anime',
    blurb: 'Soft storybook animation look',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo in the style of a classic hand-painted Japanese animated film: soft ' +
      'cel-shaded characters with simple clean linework and gentle expressive eyes, lush ' +
      'watercolor-and-gouache backgrounds, warm natural light, a calm pastoral palette of ' +
      'greens, sky blues, and cream, and a slight painterly grain. Keep the same composition, ' +
      'poses, clothing, and hairstyles, keep every person clearly recognizable as themselves, ' +
      'and keep the same number of people. Add no text.',
  },

  'animated-3d': {
    label: '3D animated film',
    blurb: 'Like a still from a big-studio animated movie',
    needs: [],
    buildPrompt: () =>
      'Transform this entire photo into a frame from a high-budget 3D animated feature film, ' +
      'keeping every element of the original composition. Keep every person instantly ' +
      'recognizable: the same facial structure, expression, skin tone, hairstyle, body ' +
      'proportions, clothing, accessories, pose, and position, translated into stylized 3D ' +
      'animation. Give skin a smooth stylized finish with subtle texture, large expressive ' +
      'animated eyes, detailed hair strands, and clothing with visible stitching and natural ' +
      'fabric folds in the original colors. Convert the background, furniture, and setting into ' +
      'the same polished 3D look with the same layout and perspective. Light it like animated ' +
      'cinema: soft key light, gentle fill, a subtle rim light, soft shadows, shallow depth of ' +
      'field, and rich film color grading. Keep the same number of people and add no text.',
  },

  'paper-craft': {
    label: 'Paper craft',
    blurb: 'Layered cut-paper diorama look',
    needs: [],
    buildPrompt: () =>
      'Recreate this photo as a layered paper-craft artwork: every person and object cut from ' +
      'colored card stock and stacked in separate layers with visible paper edges, soft drop ' +
      'shadows between the layers, slight curl and texture in the paper, and a shadow-box ' +
      'depth to the scene. Keep the same composition, poses, clothing colors, and hairstyles, ' +
      'and keep every person clearly recognizable in simplified cut-paper form. Keep the same ' +
      'number of people and add no text.',
  },

  'cinematic-anime': {
    label: 'Cinematic anime',
    blurb: 'Glowing skies, light rays, painterly detail',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a frame from a modern cinematic anime film: clean character ' +
      'linework with soft cel shading, extraordinarily detailed painted backgrounds, a ' +
      'luminous sky with towering clouds, golden-hour sun rays and lens flare, glowing ' +
      'highlights on every surface, saturated blues and warm oranges, and a sense of quiet ' +
      'wonder. Keep the same composition, poses, clothing, and hairstyles, keep every person ' +
      'clearly recognizable as themselves, keep the same number of people, and add no text.',
  },

  diorama: {
    label: 'Miniature diorama',
    blurb: 'Tilt-shift model-world look',
    needs: [],
    buildPrompt: () =>
      'Make this photo look like a hand-built miniature diorama photographed close up: ' +
      'tilt-shift blur above and below a sharp band through the middle, slightly exaggerated ' +
      'saturation, tiny-figure scale, and the faint hand-painted texture of model scenery. ' +
      'Keep everything in the photo exactly where it is, keep every person recognizable, keep ' +
      'the same number of people, and add no text.',
  },

  'ink-postcard': {
    label: 'Ink postcard',
    blurb: 'Pen-and-ink travel sketch with a wash of color',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a vintage travel postcard illustration: confident black ink line ' +
      'work with loose crosshatching, a light watercolor wash in muted warm tones, cream ' +
      'paper with a slightly worn edge, and a hand-drawn feel. Keep the same composition, ' +
      'poses, and clothing, keep every person clearly recognizable, keep the same number of ' +
      'people, and add no text or stamps.',
  },

  'japan-retro': {
    label: 'Japanese retro print',
    blurb: 'Mid-century poster, flat color, halftone',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a mid-twentieth-century Japanese commercial poster: flat areas of ' +
      'limited color in vermilion, indigo, mustard, and cream, bold simplified shapes, visible ' +
      'halftone dots and slight misregistration of the inks, aged paper texture, and a calm ' +
      'graphic composition. Keep the same composition, poses, and clothing, keep every person ' +
      'clearly recognizable, keep the same number of people, and add no text or lettering.',
  },

  blueprint: {
    label: 'Blueprint sketch',
    blurb: 'Pencil portrait over technical drawings',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a detailed pencil-and-ink sketch illustration layered over an ' +
      'architectural blueprint background with faint grid lines and technical drawings, ' +
      'scribble texture, ink crosshatch shading, and one or two bold red circular accents, ' +
      'with a selective pop of red and orange color on the people while the rest stays in ' +
      'graphite tones. Keep the facial features, faces, hair, expressions, poses, and clothing ' +
      'exactly as in the photo so every person is clearly recognizable. Keep the same number ' +
      'of people and add no text or signature.',
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

export const DEFAULT_ENABLED = [
  'pose-with-us',
  'add-couple',
  'add-photographer',
  'fix-lighting',
  'watercolor',
  'film',
];

// Labels can depend on who the event is for ("Pose with the couple",
// "Pose with the birthday star").
function resolve(text, subject) {
  return typeof text === 'function' ? text(subject) : text;
}

export function presetLabel(id, event) {
  return resolve(PRESETS[id]?.label, subjectFor(event));
}

// Everything the dashboard needs to list presets, without the prompts.
export function presetSummaries(event) {
  const subject = subjectFor(event);
  return Object.entries(PRESETS).map(([id, p]) => ({
    id,
    label: resolve(p.label, subject),
    blurb: resolve(p.blurb, subject),
    cost: p.cost || DEFAULT_COST,
    lockedCost: p.lockedCost || null,
    needsReferences: p.needs.includes('references'),
    needsBackdrops: p.needs.includes('backdrop'),
    previewable: p.needs.length === 0,
  }));
}

// What the guest page is allowed to see about the presets.
export function publicPresets(event, fallbackPreviews = {}) {
  const enabled = event.aiPresets || DEFAULT_ENABLED;
  const hasRefs = (event.referencePhotos || []).length > 0;
  const backdrops = event.backdrops || [];
  const subject = subjectFor(event);
  // An event's own samples win; otherwise the app-wide set.
  const previews = { ...(fallbackPreviews || {}), ...(event.stylePreviews || {}) };
  return enabled
    .filter((id) => PRESETS[id])
    .filter((id) => !PRESETS[id].needs.includes('references') || hasRefs)
    .filter((id) => !PRESETS[id].needs.includes('backdrop') || backdrops.length > 0)
    .map((id) => ({
      id,
      label: resolve(PRESETS[id].label, subject),
      blurb: resolve(PRESETS[id].blurb, subject),
      needsSelfie: PRESETS[id].needs.includes('selfie'),
      needsBackdrop: PRESETS[id].needs.includes('backdrop'),
      // A sample of the style on one of the host's photos, if one was made.
      previewUrl: previews[id] || null,
    }));
}

// The portraits a guest may choose to pose with. Safe to send to the browser:
// these are pictures the couple chose to show.
export function publicBackdrops(event) {
  return (event.backdrops || []).map((b) => ({ id: b.id, url: b.url }));
}

// Host-supplied text goes inside a quoted prompt; strip anything that could
// break out of the quotes.
function cleanText(text) {
  return String(text).replace(/["`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Worst case per-edit cost across the presets this event has switched on.
export function maxCostFor(event) {
  const enabled = event.aiPresets || DEFAULT_ENABLED;
  const locked = event.lockCouple === true;
  const costs = enabled
    .filter((id) => PRESETS[id])
    .map((id) => {
      const p = PRESETS[id];
      if (locked && p.lockedCost) return p.lockedCost;
      return p.cost || DEFAULT_COST;
    });
  return costs.length ? Math.max(...costs) : DEFAULT_COST;
}

export function keepsakeTextFor(event) {
  if (event.keepsakeText) return cleanText(event.keepsakeText);
  if (!event.date) return cleanText(event.name);
  const d = new Date(`${event.date}T12:00:00`);
  const pretty = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return cleanText(`${event.name} · ${pretty}`);
}
