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
import { MODELS, isTier } from './models';

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

// Era and setting edits restyle people where they stand. These two pieces
// bracket every such prompt: the model is told up front that this is an
// edit of this exact frame, and reminded at the end what must not move.
// Without them, describing a new scene ("a studio", "a premiere") reads as
// permission to re-stage everyone.
const FRAME_LOCK =
  'This is an edit of this exact photo, not a new photo. Keep the camera angle, framing, ' +
  'crop, and aspect ratio exactly as they are, and keep every person in exactly the same ' +
  'position, size, pose, gesture, head angle, and body orientation, in the same arrangement ' +
  'relative to each other. Keep every face exactly as it is: the same features, expression, ' +
  'skin tone, and age. ';

const FRAME_LOCK_END =
  ' Restyle clothing and hair in place, following each person\'s existing body shape and ' +
  'pose, and only the clothing already visible in the frame: do not widen the shot or show ' +
  'more of anyone\'s body. The outfit examples are options to choose from per person, not a ' +
  'list of people to include. Do not move, re-pose, turn, rearrange, add, or remove anyone, ' +
  'and keep whatever is in their hands. Keep exactly the same number of people, and add no ' +
  'other faces or figures anywhere, including in the background, pictures, posters, mirrors, ' +
  'or reflections.';

export const PRESETS = {
  'add-couple': {
    label: (subject) => `Add ${subject}`,
    blurb: (subject) => `Puts ${subject} in your photo`,
    needs: ['references'],
    // Tried Nano Banana Pro here (Sept 30) on the theory that the better model
    // would hold likeness more tightly. It did the opposite: it ignored the
    // reference photos and generated a generic couple. Standard Nano Banana 2
    // follows the references properly, so this preset stays on it.
    buildPrompt: ({ subject }) =>
      'Image 1 is a photo a guest took at the event. The remaining images are ' +
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
    label: "3D animated film",
    blurb: "Like a still from a big-studio animated movie",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a still from a modern 3D animated feature film, with every person reimagined as a stylized 3D animated character.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose, lips, smile, expression, hairstyle, hair texture, hair color, body build, height relative to others, and any glasses, facial hair, freckles, moles, or dimples. Keep their exact pose, gesture, crossed arms or hand positions, gaze direction, and position in the frame. Reproduce their clothing, colors, patterns, prints, shoes, jewelry, and accessories detail for detail. Each person must be instantly recognizable as their animated self.\n\nSTYLE:\n- High-end 3D animated movie character design: softly rounded forms, slightly enlarged head and eyes, gently simplified features, appealing and friendly proportions\n- Smooth, stylized skin with subtle subsurface glow; expressive, glossy eyes with bright catchlights\n- Hair sculpted into soft, defined, stylized clumps that keep the real hairstyle\n- Clothing with realistic fabric textures (denim, knit, cotton, leather) and natural folds; patterns and prints reproduced accurately\n- Soft, cinematic studio lighting with gentle rim light, soft shadows, and warm, appealing color grading\n- Polished, ultra-detailed 3D render\n\nBACKGROUND: Keep the original background and setting, recreated in the same 3D animated style with soft depth of field.\n\nMULTIPLE PEOPLE: Render every person in the photo as their own character with equal detail, keeping their exact arrangement, spacing, heights, and interactions.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no titles, no logos, no usernames, no borders, no watermarks.\n\nAvoid: text, title, logo, username, watermark, photorealism, 2D illustration, anime, chibi, clay, plastic toy look, uncanny realistic face, generic face, altered face, changed identity, same face on everyone, changed outfit, missing glasses, missing accessories, wrong number of people, extra fingers, distorted hands, extra limbs.",
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
    label: "Cinematic anime",
    blurb: "Golden light, prism flares, painted backgrounds",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a modern anime cel illustration in the style of a high-budget Japanese animated feature film.\n\nIDENTITY: Keep the exact face, facial identity, and likeness of every person from the reference image: face shape, skin tone, eye color, eye shape, eyebrows, nose, lips, expression, hairstyle, hair color, and any glasses, facial hair, freckles, moles, or dimples. Eyes may be only slightly enlarged in the anime style, keeping their real shape and spacing. Keep the exact pose, hands, gestures, wardrobe, jewelry, props, framing, camera angle, and lens distortion of the original. Each person must be instantly recognizable.\n\nLINE & SHADING: Clean, confident ink linework of varying weight. Clothing, objects, and forms use flat cel shading with two to three tone steps and crisp shadow edges; skin and hair alone get soft airbrushed gradients on top of the cel base for a luminous finish.\n\nLIGHT & ATMOSPHERE: Enhance the photo's existing light source into cinematic anime lighting. In daylight or near windows, warm golden sunlight streams through the frame with visible light rays. At night or indoors, use glowing warm practical lights (lamps, string lights, candles) with soft bloom. Add floating dust motes or light particles and a few scattered prismatic rainbow lens flares across walls and surfaces.\n\nCOLOR: Rich, saturated palette with slightly desaturated cool blue-teal shadows and warm amber highlights, while keeping each person's skin tone true to the original.\n\nBACKGROUND: Keep the original setting, rendered as painted anime background art with more texture and painterly detail than the characters.\n\nMULTIPLE PEOPLE: If there are multiple people, give each person distinct, individual features as in the photo, keeping their relative positions and interaction.\n\nFINISH: Subtle paper grain over the whole image.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no text, no usernames, no logos, no borders, no watermarks.\n\nAvoid: photorealism, 3D render look, muddy shading, chibi, oversized anime eyes, moe style, generic anime face, same face on everyone, altered face, changed identity, changed skin tone, golden-tinted skin, changed hairstyle, changed outfit, missing glasses, fake sunlight at night, text, username, watermark, logo, extra fingers, distorted hands.",
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
    label: "Ink postcard",
    blurb: "Misty ink wash with one soft accent color",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into an \"ink postcard\": a serene East Asian ink wash painting with soft selective color, on textured rice paper.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, facial features, expression, hairstyle, hair color, body build, and any glasses, facial hair, or distinguishing marks. Keep their exact pose, gesture, gaze direction, and position relative to the scene, along with their clothing, its cut and patterns, and accessories. Keep any animals, key landmarks, and meaningful objects in the scene. Only the rendering style changes.\n\nSTYLE:\n- Primarily soft gray and black ink washes with delicate, refined brushwork\n- Selective color: keep only one or two of the most meaningful colors from the original photo (for example a landmark, a garment, flowers, a bouquet, or a sunset glow), rendered as soft, muted, watercolor-like washes; everything else stays monochrome ink\n- People and nearby key elements painted with the most detail and clarity, with clean brush outlines and gentle tonal washes\n- Distant scenery simplified into pale, misty, layered washes that fade into soft fog\n- Simplify the composition by removing minor clutter and distractions, while keeping all people, animals, and key landmarks\n- Reflections in water or shiny surfaces shown as soft vertical ink and color streaks\n- A delicate ink-painted branch (pine, plum blossom, willow, or bamboo, chosen to suit the scene) reaching in from one top corner as a natural frame\n- Generous empty paper space on one side for a calm, balanced postcard composition\n- Warm off-white rice paper texture with subtle fibers throughout\n\nCALLIGRAPHY & SEAL: In the empty paper space, two vertical columns of brush-written calligraphy reading \"执子之手\" (right column) and \"与子偕老\" (left column), with a small square red seal stamp beneath.\n\nMULTIPLE PEOPLE: If there are multiple people, paint each one with equal care, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no other text, no title, no logos, no borders, no watermarks.\n\nAvoid: title text, English text, logo, watermark, full color, saturated colors, photorealism, 3D render, anime, manga, digital painting look, heavy black background, cluttered composition, removed people, altered face, changed identity, generic face, changed outfit, missing accessories, extra fingers, distorted hands, extra limbs.",
  },

  'japan-retro': {
    label: "Japanese retro print",
    blurb: "Showa-era illustration with risograph grain",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a retro Japanese illustration in the style of a vintage 1970s-80s Showa-era printed poster or book illustration.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, expression, hairstyle, hair texture, hair color, and any glasses, facial hair, or distinguishing marks. Keep their exact pose, gesture, gaze direction, framing, and position, along with their clothing, colors, patterns, bags, and accessories. Keep the original composition, camera angle, and every object and setting element in its place. Only the rendering style changes.\n\nSTYLE:\n- Clean, precise, hand-drawn ink linework of even, slightly fine weight, with careful detail on every object, pattern, and surface\n- Flat color fills with simple cel-style shadow shapes; minimal gradients\n- Hair drawn as flowing, rhythmic ink strands with flat dark fill\n- Muted, slightly faded vintage palette that keeps the original colors but shifts them toward warm, desaturated tones: vermilion red, burnt orange, mustard, cream, sage, dusty teal, and charcoal instead of pure black\n- Grainy risograph / offset-print texture with subtle halftone dots, slight ink misregistration, fine speckle, and warm aged-paper tone throughout\n- Calm, nostalgic, atmospheric mood\n\nTEXT: Keep any signs, labels, or lettering that already exist in the photo, redrawn in the same style. Do not add any new text.\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal care, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no added text, no logos, no borders, no watermarks.\n\nAvoid: added text, logo, watermark, photorealism, 3D render, modern anime, chibi, glossy digital painting, neon colors, oversaturated, smooth gradients, clean digital look, altered face, changed identity, generic face, changed hairstyle, missing accessories, extra fingers, distorted hands, extra limbs.",
  },

  blueprint: {
    label: "Blueprint sketch",
    blurb: "Ink sketch over technical drawings with one color pop",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a detailed sketch illustration layered over an architectural blueprint background.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, expression, hairstyle, hair texture, hair color, and any glasses, sunglasses, facial hair, freckles, or distinguishing marks. Keep their exact pose, head angle, gaze direction, and framing, along with their actual clothing, its colors and cut, and accessories. Only the rendering style changes.\n\nSTYLE:\n- Detailed hand-drawn ink sketch with confident contour lines and fine, expressive crosshatch shading on face, hair, and clothing\n- Loose scribble texture and energetic pencil/ink strokes at the edges, fading out into the background\n- Mostly black ink on warm cream paper, with a selective color pop: take the one or two boldest accent colors from the person's clothing or accessories and render only those areas in rich color, keeping everything else in ink\n- Hair drawn in dense, flowing ink strokes that keep the real hairstyle\n\nBACKGROUND: Replace the original background with an architectural blueprint design behind the subject: faint technical drawings, grid lines, floor plans, elevation sketches, measurement marks, and compass arcs in thin sepia and gray ink on aged cream paper. Add one or two large, flat circular accents, painted loosely like a stamp or sun, behind the head and shoulders, in the same accent color as the color pop.\n\nMULTIPLE PEOPLE: If there are multiple people, sketch each one with equal detail, keeping their relative positions and interaction from the photo.\n\nCOMPOSITION: Portrait orientation, subject centered from mid-chest up, artistic urban portrait feel.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no signature, no text, no logos, no borders, no watermarks.\n\nAvoid: signature, text, logo, watermark, full color illustration, photorealism, 3D render, anime, cartoon, flat vector, changed outfit, added sunglasses, added accessories, altered face, changed identity, generic face, changed hairstyle, changed expression, extra fingers, distorted hands.",
  },

  'mecha-anime': {
    label: 'Retro mecha anime',
    blurb: 'Sharp 2D cel animation, bold shadows',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as classic 2D mecha-anime inspired cel animation: dramatic facial ' +
      'structure with sharp geometric features, expressive eyes, precise technical linework, ' +
      'detailed cel-animation rendering, bold color separation, strong graphic shadows, and ' +
      'the look of retro Japanese television animation. Keep the same composition, poses, ' +
      'clothing, and hairstyles, keep every person clearly recognizable as themselves, keep the ' +
      'same number of people, and add no text.',
  },

  'editorial-cartoon': {
    label: 'Editorial cartoon',
    blurb: 'Mid-century magazine illustration, limited palette',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a sophisticated mid-century editorial cartoon: elegant simplified ' +
      'facial shapes, expressive hand-inked contours, slightly elongated proportions, a limited ' +
      'graphic palette of three or four flat colors, and the subtle paper-print character of a ' +
      'magazine illustration. Keep the same composition, poses, clothing, and hairstyles, keep ' +
      'every person clearly recognizable as themselves, keep the same number of people, and add ' +
      'no text.',
  },

  'cartoon-3d': {
    label: 'Modern 3D cartoon',
    blurb: 'Clean, vibrant, big expressive eyes',
    needs: [],
    buildPrompt: () =>
      'Turn this photo into a highly stylized modern 3D cartoon illustration: big expressive ' +
      'cartoon eyes, well-defined eyebrows, smooth skin with subtle texture, stylized hair ' +
      'strands, clean crisp lines, smooth shading, cinematic lighting, and a colorful polished ' +
      'render. Keep every person recognizable with their own face, expression, hairstyle, ' +
      'clothing, and accessories, in the same poses and composition, and simplify the ' +
      'background into the same clean cartoon look. Keep the same number of people. No text, ' +
      'no logos, no watermark, no frame, no additional objects.',
  },

  caricature: {
    label: '3D caricature',
    blurb: 'Polished collectible-figure look',
    needs: [],
    buildPrompt: () =>
      'Turn this photo into a highly polished 3D cartoon character portrait, like a premium ' +
      'collectible figure: gently caricatured proportions with a slightly larger head and ' +
      'large warm eyes, smooth sculpted skin with soft subsurface glow, neatly defined ' +
      'eyebrows and hair, clothing recreated faithfully with soft fabric detail, and studio ' +
      'lighting on a clean softly lit background. Keep every person instantly recognizable ' +
      'with their own features, expression, skin tone, hairstyle, and outfit, in the same ' +
      'poses and composition. Keep the same number of people and add no text or logos.',
  },

  'mosaic-poster': {
    label: 'Mosaic poster',
    blurb: 'Photo above, scattered tile collage below',
    needs: [],
    buildPrompt: () =>
      'Create a vertical 3:4 editorial poster, full-bleed with no border, split evenly into two ' +
      'halves with no divider line; the change of background colour separates them. TOP HALF: ' +
      'this photo, unchanged in content, with natural overcast light, muted cool colour grading, ' +
      'and film-like grain; extend the sky or background slightly if needed to leave some empty ' +
      'space in the upper third. Keep every person exactly as they are: same faces, expressions, ' +
      'hair, clothing, and poses, and the same number of people. BOTTOM HALF: a warm cream paper ' +
      'background on which the same image is reconstructed entirely from small uniform square ' +
      'mosaic tiles, as if the photograph were cut into squares and reassembled. The centre is ' +
      'dense and clearly readable; toward the edges the squares progressively thin out, scatter, ' +
      'and drift apart into isolated fragments with the cream paper showing through the gaps. ' +
      'Vary tile positions slightly for a handmade collage feel, and keep one small saturated ' +
      'accent colour from the photo as the visual anchor. Add no text.',
  },

  doodle: {
    label: 'Doodle sketch',
    blurb: 'Cute hand-drawn brush-pen doodle',
    needs: [],
    buildPrompt: () =>
      'Transform this photo into a minimalist hand-drawn doodle illustration: simple brush-pen ' +
      'outlines with slightly wobbly, imperfect strokes, details reduced to cute, simple shapes, ' +
      'a naive sketchbook feel with soft watercolour-ink fills and charming imperfections, on a ' +
      'clean white background. Keep the main subjects and composition, keep each person ' +
      'recognizable by their hairstyle, clothing colours, and pose, keep the same number of ' +
      'people, and add no text.',
  },

  'black-white': {
    label: 'Timeless black & white',
    blurb: 'Classic editorial monochrome',
    needs: [],
    buildPrompt: () =>
      'Convert this photo into a timeless black-and-white wedding photograph: rich deep blacks, ' +
      'creamy highlights, gentle contrast, a fine silver-gelatin grain, and a soft vignette. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'golden-hour': {
    label: 'Golden hour',
    blurb: 'Warm late-afternoon sunlight',
    needs: [],
    buildPrompt: () =>
      'Relight this photo as if it were taken at golden hour: warm low sunlight from one side, a ' +
      'soft glow and gentle rim light on hair and shoulders, long warm shadows, and a honeyed ' +
      'color grade across the scene. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  polaroid: {
    label: 'Instant photo',
    blurb: 'Faded instant film in a white frame',
    needs: [],
    buildPrompt: () =>
      'Make this look like an instant-film print: slightly faded colors with soft cyan shadows and ' +
      'warm highlights, gentle flash falloff, and fine film texture, presented inside the classic ' +
      'white instant-photo border with the wider margin at the bottom, left blank. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'old-hollywood': {
    label: 'Old Hollywood',
    blurb: '1940s studio glamour lighting',
    needs: [],
    buildPrompt: () =>
      'Restyle this as a 1940s Hollywood studio portrait: dramatic black-and-white with a single ' +
      'sculpted key light, deep velvety shadows, a soft glow on highlights, and a gently darkened ' +
      'studio background. Change only the lighting, tone, and background. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'cinematic-still': {
    label: 'Movie still',
    blurb: 'Widescreen film colour grade',
    needs: [],
    buildPrompt: () =>
      'Make this photo look like a still from a feature film: an anamorphic widescreen crop with ' +
      'thin black letterbox bars, a teal-and-amber cinematic color grade, soft highlight bloom, ' +
      'and subtle film grain. Keep everyone fully inside the frame. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'fairy-lights': {
    label: 'Fairy lights',
    blurb: 'Twinkling string lights and bokeh behind',
    needs: [],
    buildPrompt: () =>
      'Add warm twinkling string lights and soft golden bokeh to the background of this photo, as ' +
      'if fairy lights were hanging behind the people, with a faint warm glow spilling onto the ' +
      'scene. Place the lights only in the background and never in front of anyone. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'petal-shower': {
    label: 'Petal shower',
    blurb: 'Falling flower petals',
    needs: [],
    buildPrompt: () =>
      'Add a gentle shower of soft pink and white flower petals drifting through the air of this ' +
      'photo, a few in sharp focus and most softly blurred, with a little natural motion. Keep ' +
      'petals off faces. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'snow-globe': {
    label: 'Snow globe',
    blurb: 'The scene inside a glass globe',
    needs: [],
    buildPrompt: () =>
      'Place this exact photo inside a glass snow globe resting on a wooden base on a softly lit ' +
      'table, with gentle falling snow inside the globe and subtle reflections on the glass. The ' +
      'photo inside the globe must be the original image, only curved to the globe, not redrawn. ' +
      'Keep it a real photograph. Do not redraw, retouch, reshape, or restyle any face or body: ' +
      'every person keeps exactly the same face, expression, skin, hair, clothing, and pose, and ' +
      'the same number of people. Add no text.',
  },

  'oil-portrait': {
    label: 'Classical oil portrait',
    blurb: 'Old-master brushwork, candlelit tones',
    needs: [],
    buildPrompt: () =>
      'Repaint this photo as a classical oil painting in the manner of an old-master portrait: ' +
      'visible confident brushstrokes, rich glazed color, warm candlelit tones with deep umber ' +
      'shadows, soft chiaroscuro on the faces, and a fine canvas texture with subtle varnish sheen. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'silk-painting': {
    label: 'Silk painting',
    blurb: 'Vietnamese tranh lụa, soft washes on silk',
    needs: [],
    buildPrompt: () =>
      'Repaint this photo as a traditional Vietnamese silk painting (tranh lụa): delicate fine ' +
      'outlines, soft translucent washes of muted color that bleed gently into the silk, pale ' +
      'misty backgrounds, the faint woven texture of silk throughout, and a calm, poetic mood. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'dong-ho': {
    label: 'Đông Hồ folk print',
    blurb: 'Vietnamese woodblock, natural pigments',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a traditional Vietnamese Đông Hồ folk woodblock print: bold black ' +
      'carved outlines, flat areas of natural pigment in earthy red, ochre yellow, leaf green, ' +
      'and charcoal black, slight block-printing misregistration, and the shimmering speckled ' +
      'texture of handmade dó paper with seashell coating. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  claymation: {
    label: 'Claymation',
    blurb: 'Hand-sculpted clay figures on a tiny set',
    needs: [],
    buildPrompt: () =>
      'Recreate this photo as a stop-motion claymation scene: every person and object sculpted ' +
      'from soft modeling clay with subtle fingerprint marks and smooth rounded forms, a ' +
      'handmade miniature set in the same layout, and warm, soft studio lighting. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'comic-book': {
    label: 'Comic book panel',
    blurb: 'Bold inks, halftone dots, punchy colour',
    needs: [],
    buildPrompt: () =>
      'Redraw this photo as a single dramatic comic-book panel: bold confident ink outlines, ' +
      'dynamic shading with hatching, saturated flat colors, visible halftone dot texture, and ' +
      'a slightly aged print-paper look. No speech bubbles or captions. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'stained-glass': {
    label: 'Stained glass',
    blurb: 'Jewel-toned glass with light glowing through',
    needs: [],
    buildPrompt: () =>
      'Recreate this photo as a stained-glass window: the scene divided into pieces of ' +
      'jewel-toned glass joined by dark lead lines, light glowing through the glass with subtle ' +
      'texture and color variation in each piece, and faces rendered in fine painted detail on ' +
      'the glass. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  embroidery: {
    label: 'Embroidery',
    blurb: 'Stitched in thread on linen',
    needs: [],
    buildPrompt: () =>
      'Recreate this photo as a hand embroidery on natural linen stretched in a wooden embroidery ' +
      'hoop: everything stitched in colored cotton thread with satin stitch for faces and skin, ' +
      'long-and-short stitch for shading, visible thread texture and direction, and a few loose ' +
      'threads at the edges. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'anime-feature': {
    label: 'Anime feature film',
    blurb: 'Premium hand-drawn anime movie frame',
    needs: [],
    buildPrompt: () =>
      'Transform this photo into a premium cinematic Japanese anime frame while preserving the ' +
      'composition, poses, camera angle, placement, framing, perspective, setting, and spatial ' +
      'layout exactly. Do not redesign the scene; reinterpret it as a beautifully hand-drawn frame ' +
      'from a high-budget modern anime feature film. Give the people refined anime facial ' +
      'proportions, expressive eyes, elegant linework, realistic anatomy, naturally flowing hair, ' +
      'detailed clothing folds, and subtle expressions, faithful to the original pose and ' +
      'interaction. Use clean confident line art, rich cinematic anime shading, soft gradients, ' +
      'painted highlights, subtle rim lighting, and balanced color grading. Add gentle atmosphere ' +
      'such as softly moving hair and clothing, drifting dust motes, delicate light rays, and soft ' +
      'haze. Keep the original architecture, objects, and lighting direction, rendered with ' +
      'painterly backgrounds and rich texture. Calm and emotional, with no action effects, speed ' +
      'lines, or dramatic energy. ' +
      'Keep the same composition, poses, clothing, and hairstyles, keep every person clearly ' +
      'recognizable as themselves, keep the same number of people, and add no text.',
  },

  'throwback-1985': {
    label: '1985 throwback',
    blurb: 'You, photographed in the mid-80s',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a genuine snapshot taken around 1985. Change only the clothing, hair, ' +
      'accessories, background, and photographic look: give each person bold, unmistakably ' +
      'mid-1980s styling, with expressive silhouettes, statement accessories, layered details, ' +
      'and period colors and textures; age the background to the period without moving it; and ' +
      'give the whole image analog grain, faded color, direct flash, subtle softness, and a ' +
      'small red-orange camera date stamp in the lower right corner. No modern objects.' +
      FRAME_LOCK_END,
  },

  'misty-forest': {
    label: 'Misty forest',
    blurb: 'People unchanged, setting becomes a foggy forest',
    needs: [],
    buildPrompt: () =>
      'Transform the setting of this photo into a breathtaking misty forest: dense natural white ' +
      'fog, tall trees and lush foliage fading into the mist, soft volumetric light rays ' +
      'filtering through, and rich forest color grading in deep emerald, dark teal, moss green, ' +
      'and earthy brown. Light the people to match the soft morning fog so they belong in the ' +
      'scene, like a premium photograph taken on a cold misty morning. ' +
      'Keep it a real photograph of the same people. Do not redraw, retouch, reshape, or restyle ' +
      'any face: every person keeps exactly the same face, expression, skin, and pose, and the ' +
      'same number of people. Add no text.',
  },

  'noir-glitch': {
    label: 'Noir glitch',
    blurb: 'Stark black & white with crimson glitch art',
    needs: [],
    buildPrompt: () =>
      'Restyle this photo as a fusion of realistic photography and abstract digital glitch art: ' +
      'the people rendered in stark high-contrast black and white with dramatic chiaroscuro side ' +
      'lighting, set against a clean minimalist white background, with aggressive splashes of ' +
      'vibrant crimson red. The outer edges of the image break up into abstract geometric shards, ' +
      'pixel sorting, and glitchy red brushstrokes, with gritty ink-wash texture and a high-grain ' +
      'film look. Keep the faces themselves intact and realistic; the glitch never crosses a ' +
      'face. ' +
      'Keep it a real photograph of the same people. Do not redraw, retouch, reshape, or restyle ' +
      'any face: every person keeps exactly the same face, expression, skin, and pose, and the ' +
      'same number of people. Add no text.',
  },

  'jazz-1920s': {
    label: '1920s Jazz Age',
    blurb: 'Art Deco glamour in sepia',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a photograph taken around 1925. Change only the clothing, hair, ' +
      'background, and photographic look: restyle each person\'s outfit as its 1920s Jazz Age ' +
      'equivalent, choosing from beaded and fringed drop-waist dresses, finger waves and bobs, pinstripe suits, bow ties, pocket ' +
      'squares, and long pearl necklaces; replace only the background behind them with an Art ' +
      'Deco interior with geometric gold detail, keeping the same perspective and floor line; ' +
      'and give the whole image warm sepia tone, soft focus, gentle vignetting, and fine silver ' +
      'grain. No modern objects and no text.' +
      FRAME_LOCK_END,
  },

  fifties: {
    label: '1950s',
    blurb: 'Saturated slide-film colour, full skirts',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a color photograph taken around 1956. Change only the clothing, hair, ' +
      'background, and photographic look: restyle each person\'s outfit as its 1950s ' +
      'equivalent, choosing from full circle skirts, cardigans, polka dots, pin curls, slicked-back hair, and crisp short-sleeve ' +
      'shirts; replace only the background behind them with a sunny 1950s setting such as a ' +
      'suburban backyard or a chrome diner, keeping the same perspective and floor line; and ' +
      'give the whole image the rich saturated reds and teals, bright daylight, and fine grain ' +
      'of 1950s slide film. No modern objects and no text.' +
      FRAME_LOCK_END,
  },

  seventies: {
    label: '1970s',
    blurb: 'Wide collars, warm faded film',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a photograph taken around 1976. Change only the clothing, hair, ' +
      'background, and photographic look: restyle each person\'s outfit as its 1970s equivalent, choosing from wide collars, ' +
      'flared trousers, earth-tone patterns, suede and corduroy, feathered voluminous hair, and ' +
      'tinted aviator glasses; replace only the background behind them with a 1970s setting ' +
      'such as a wood-paneled room, keeping the same perspective and floor line; and give the ' +
      'whole image warm orange and brown tones, faded color, soft focus, and heavy grain. No ' +
      'modern objects and no text.' +
      FRAME_LOCK_END,
  },

  nineties: {
    label: '1990s',
    blurb: 'Disposable-camera flash and a date stamp',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a disposable-camera snapshot taken around 1996. Change only the ' +
      'clothing, hair, accessories, and photographic look: restyle each person\'s outfit as its mid-1990s ' +
      'equivalent, choosing from denim jackets, oversized blazers, slip dresses, flannel, scrunchies, and butterfly ' +
      'clips; keep the background as it is but age it to the period; and give the whole image ' +
      'harsh direct flash, slightly blown highlights, a warm color shift, visible grain, and a ' +
      'small orange camera date stamp in the lower right corner. No modern objects and no other ' +
      'text.' +
      FRAME_LOCK_END,
  },

  y2k: {
    label: 'Y2K',
    blurb: 'Early-digital camera, metallics and shine',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a photo taken on an early digital camera around 2002. Change only the ' +
      'clothing visible in the frame, hair, small accessories, and photographic look: restyle ' +
      'each person\'s top and outer layers as their Y2K equivalent, choosing from metallic or ' +
      'satin tops, baby tees, zip-up track jackets, and sheer layers, and add Y2K touches such ' +
      'as tinted rimless sunglasses, frosted lip gloss, small hair clips, and flipped or ' +
      'piecey hair. Keep the background as it is. Give the whole image on-camera flash, ' +
      'slightly oversaturated color, soft low-resolution detail, and a small digital timestamp ' +
      'in the lower right corner. Keep the exact same crop: if the photo shows people from the ' +
      'waist or chest up, the result does too. Keep everyone\'s arms, hands, and head tilt ' +
      'exactly as they are. No other text.' +
      FRAME_LOCK_END,
  },

  victorian: {
    label: 'Victorian portrait',
    blurb: '1890s sepia photograph',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a photograph taken around 1890. Change only the clothing, hair, ' +
      'background, and photographic look: restyle each person\'s outfit as its Victorian ' +
      'equivalent, choosing from high-collared blouses and dresses with lace, frock coats, ' +
      'waistcoats, and cravats, and give hair a Victorian finish such as pinned-up styles or ' +
      'neat side partings. Replace only the background behind them with a plain, softly ' +
      'mottled grey-brown studio backdrop: no painted scenes, figures, faces, portraits, ' +
      'statues, or furniture, and nothing placed in front of anyone. Give the whole image rich ' +
      'sepia tone, soft edges, gentle fading, and fine surface wear like an antique print. ' +
      'Keep everyone\'s natural expressions and stances; do not make the pose more formal. ' +
      'No modern objects and no text.' +
      FRAME_LOCK_END,
  },

  'saigon-1960s': {
    label: 'Saigon 1960s',
    blurb: 'Áo dài, old boulevards, faded film colour',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a color photograph taken in Saigon around 1965. Change only the ' +
      'clothing, hair, background, and photographic look: restyle each person\'s outfit as its elegant 1960s ' +
      'Saigon equivalent, choosing from graceful áo dài in soft pastel and floral silk, beehive and bouffant ' +
      'hair, cat-eye sunglasses, and tailored short-sleeve shirts with slim trousers; replace ' +
      'only the background behind them with a tree-lined Saigon boulevard with old ' +
      'colonial-era buildings and a vintage motor scooter parked in the distance, keeping the ' +
      'same perspective and ground line and placing nothing in front of anyone; and give the ' +
      'whole image faded warm color, soft contrast, and fine grain. No modern objects and no ' +
      'readable text.' +
      FRAME_LOCK_END,
  },

  'royal-court': {
    label: 'Royal court',
    blurb: 'Huế imperial court dress',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Change only the clothing, hair, and background: dress each person in traditional Nguyễn ' +
      'dynasty court style, with richly embroidered áo nhật bình and áo tấc in deep red, gold, ' +
      'and royal blue silk with phoenix and cloud motifs, khăn vấn headwraps, and jade and gold ' +
      'jewelry; replace only the background behind them with a palace courtyard of the Huế ' +
      'imperial city with red lacquered columns and golden roof ornaments, keeping the same ' +
      'perspective and ground line; and light it warmly and richly so the people match the ' +
      'scene. No text.' +
      FRAME_LOCK_END,
  },

  'red-carpet': {
    label: 'Red carpet',
    blurb: 'Black-tie at a film premiere',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Change only the clothing, hair, background, and lighting: restyle each person\'s outfit as black-tie, ' +
      'with elegant gowns, tuxedos, styled hair, and fine jewelry; replace only the background ' +
      'behind them with a film premiere: a red carpet under their feet that follows the existing ' +
      'floor and perspective, and a plain dark backdrop behind them with a few photographers\' ' +
      'flashes visible in the far background; and light them with the bright crisp flash of a ' +
      'press photo. They stay exactly as they are posed in the original; do not turn them into ' +
      'a red-carpet pose. No logos and no text.' +
      FRAME_LOCK_END,
  },

  'hoi-an': {
    label: 'Postcard from Hội An',
    blurb: 'Lantern-lit old-town streets',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Change only the background and lighting; keep everyone\'s clothing exactly as it is. ' +
      'Replace only the background behind the people with the old town of Hội An at dusk: a ' +
      'lantern-lit street of yellow-walled merchant houses with wooden shutters, strings of ' +
      'colorful silk lanterns glowing overhead, bougainvillea on the walls, and the river softly ' +
      'reflecting lights in the distance, keeping the same perspective, horizon, and ground line ' +
      'as the original. Relight the people with warm lantern light so they belong in the scene, ' +
      'and make it look like a real travel photograph. No readable signs or text.' +
      ' Do not move, re-pose, turn, rearrange, add, or remove anyone, and do not widen the ' +
      'shot. Keep exactly the same number of people, and add no other faces or figures ' +
      'anywhere, including people walking in the street behind them.',
  },

  'year-2085': {
    label: 'The year 2085',
    blurb: 'A gentle, optimistic future',
    needs: [],
    buildPrompt: () =>
      FRAME_LOCK +
      'Make it look like a photograph taken in the year 2085. Change only the clothing, ' +
      'background, and lighting: restyle each person\'s outfit in a gentle, optimistic future style, choosing from ' +
      'soft-tech fabrics, subtle luminous seams, and elegant minimal silhouettes; replace only ' +
      'the background behind them with a lush garden city with flowing architecture and ' +
      'greenery on every terrace in soft daylight, keeping the same perspective and ground ' +
      'line; and keep it calm and beautiful rather than dark or dystopian, as a real photograph. ' +
      'No text.' +
      FRAME_LOCK_END,
  },

  'fifty-years': {
    label: '50 years from now',
    blurb: 'Everyone aged gracefully into their 70s and 80s',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they will look about fifty years from now, aged ' +
      'gracefully and naturally into their seventies and eighties: silver and white hair, ' +
      'softened skin with natural wrinkles and laugh lines, and the same warmth in their ' +
      'expressions. Each person must remain clearly recognizable as themselves, with the same ' +
      'face shape, features, skin tone, and smile, simply older. Keep the same clothing, poses, ' +
      'setting, lighting, and composition, keep it a real photograph, keep the same number of ' +
      'people, and add no text.',
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

  // --- Prompt library, Oct 2026 ---------------------------------------
  // Reverse-engineered from popular social-media styles, rewritten to keep
  // faces and outfits, handle groups, and avoid franchise characters/brands.
  // Nano Banana has no negative-prompt field, so each ends with an Avoid list.
  // `tier: 'full'` marks complex scenes that should default to the Full model.

  'brick-world': {
    label: "Brick world",
    blurb: "You stay real; everything around you becomes bricks",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a hybrid toy-brick diorama.\n\nPreserve the exact facial identity of every person from the reference image. Keep each person 100% photorealistic and unchanged: same face, facial features, expression, hairstyle, skin tone and texture, clothing, accessories, pose, and position in the frame. Do not turn any person into a minifigure, toy, or plastic.\n\nRebuild everything else in the scene out of real interlocking plastic toy building bricks, with no logos printed on them, keeping the original layout, composition, camera angle, and color palette:\n- Floors, ground, and other flat surfaces become toy-brick baseplates and tiles in colors that match the original surfaces, with visible studs\n- Walls, furniture, buildings, vehicles, trees, and other large structures become brick-built models with visible studs, seams, and slope bricks\n- Plants, flowers, food, decorations, and small details become matching brick elements\n- Smaller objects the people are holding or touching can be brick-built or stay realistic, blending both worlds naturally\n\nThe people interact convincingly with the brick world: they stand, sit, or lean on the bricks, cast realistic shadows on the brick surfaces, and hold objects naturally.\n\nLighting: match the original photo's light source, direction, and mood, with glossy plastic highlights on the bricks. The distant background may stay as a softly blurred real environment for depth. Shallow depth of field, like a high-end editorial photograph. Ultra-detailed, sharp focus on the people.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no borders, no watermarks.\n\nAvoid: inset image, picture-in-picture, before/after, collage, split screen, text, watermark, logo, minifigure person, plastic skin, toy face, cartoon face, altered face, changed identity, distorted hands, extra limbs.",
  },

  'second-world': {
    label: "Second world poster",
    blurb: "The photo tears open into a hand-made paper world",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Transform this photo into a \"second world poster\": a mixed-media artwork where the real photo continues past a torn paper edge into a whimsical hand-made world.\n\nTOP SECTION (REAL PHOTO): The upper portion of the image is the original photo, kept fully photographic and unchanged: same people, faces, poses, clothing, colors, lighting, and setting. Preserve the exact facial identity and likeness of every person. All people must stay entirely within the photo section. Position the tear below them so it never cuts through any person, face, or hand.\n\nTHE TEAR: Across the image, the photo ends in a realistic torn-paper edge: irregular, slightly curled, with a thin white fibrous paper border and a soft drop shadow, revealing warm off-white textured paper underneath.\n\nBOTTOM SECTION (THE SECOND WORLD): Identify the most prominent leading line or flowing element in the photo, such as a road, path, aisle, river, waves, shoreline, beam of light, table runner, ribbon, veil, staircase, or line of lights. Continue that same element seamlessly across the tear onto the paper, where it transforms and starts playing by new rules, becoming something surreal and playful (a road that unspools into a ribbon, waves that fold into stairs, a light beam you can hold, an aisle that becomes a paper bridge). The continued element is built as a dimensional papercraft / cut-paper sculpture in colors matched to the photo, casting soft realistic shadows on the paper.\n- Around it, delicate black fine-liner ink doodles: loose swirls, curls, motion lines, tiny clouds, or small sketches that animate the transformation\n- One or more tiny, simple ink-drawn figures interacting with the transformed element (climbing it, pulling it, walking along it), echoing the people in the photo\n- Generous empty paper space; minimal, airy, poetic composition\n\nCAPTION: In the bottom right corner, a short, poetic, handwritten caption in casual black ink script (5-6 words) describing the transformation, underlined with a single loose pen stroke. Correctly spelled.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no extra text, no logos, no borders, no watermarks.\n\nAvoid: tear through faces, tear through people, cropped people, altered faces, changed identity, illustrated top half, painted photo, collage grid, extra text, watermark, logo, cluttered doodles, full-color illustration on paper, misspelled text, gibberish text, distorted hands.",
  },

  'double-exposure': {
    label: "Double exposure",
    blurb: "Your silhouette filled with the scene around you",
    needs: [],
    buildPrompt: () =>
      "Create a cinematic double-exposure portrait of the person (or people) from the uploaded photo.\n\nIDENTITY: Preserve each person's exact facial identity and likeness: face shape, profile, skin tone, facial features, hairstyle, hair color, facial hair, glasses, and expression. The face stays clearly visible and recognizable: rendered photographically in a three-quarter or profile view, with the double-exposure imagery blending in from the hair, shoulders, and body, never covering the eyes, nose, or mouth.\n\nDOUBLE EXPOSURE: The person's head-and-shoulders silhouette is sharply defined against the background, and within the silhouette (hair, shoulders, chest, and the edges of the face) a second image is blended in like a film double exposure: scenes drawn from the setting and mood of the original photo (its location, landscape, city, venue, or nature), arranged into a flowing visual story, with skylines, streets, trees, lights, water, and sky merging naturally with the contours of the body. The blend fades smoothly at the edges, with soft transitions and no hard cut lines.\n\nCOLOR & BACKGROUND: Vivid, saturated color within the silhouette, contrasting with a clean, luminous, softly glowing background halo in a single color that complements the imagery. Fine-art editorial poster quality, high detail in both the portrait and the blended scenes, and a cinematic, emotional mood.\n\nMULTIPLE PEOPLE: If there are two or more people, their silhouettes overlap or face each other in profile, with one continuous blended scene flowing through all of them.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no watermarks.\n\nAvoid: celebrity likeness, imagery covering eyes, hidden face, blank black silhouette, faceless silhouette, hard cut edges, collage grid, cluttered composition, altered face, changed identity, missing glasses, text, logo, watermark, cartoon, 3D render.",
  },

  'light-motion': {
    label: "Light in motion",
    blurb: "Limbs dissolve into sapphire and lilac light trails",
    needs: [],
    buildPrompt: () =>
      "Create an elegant, near-abstract full-body portrait of the person (or people) in this photo, in a dynamic twisted three-quarter pose, shot from a low side angle with strong perspective. The body is angled forward with one arm extended, as if caught mid-motion.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, expression, hairstyle, hair color, and any glasses, facial hair, or distinguishing marks. Keep their real clothing, its cut and colors, and accessories. If the photo shows only part of the body, extend the rest naturally and consistently with the visible clothing and build.\n\nMOTION EFFECT: A dramatically beautiful, cool-toned motion blur in sapphire, deep lilac, and cobalt dissolves the extended limbs, the trailing edges of the clothing, and the hair tips into chaotic yet graceful streaks of light and fine particle trails, flowing in the direction of movement. The face, head, neck, torso, and any hand near the face stay sharp, crisp, and fully intact, with clear facial detail.\n\nMULTIPLE PEOPLE: If there are multiple people, each person gets their own motion trails, and their faces stay sharp and separate. They move together in a coordinated way, keeping their relative positions and interaction from the photo, without merging into one shape.\n\nBACKGROUND & MOOD: No scenery. The background is a smooth, glowing gradient from dark indigo to luminous lavender, with soft cinematic rim lighting on the subject. Cinematic, poetic, fine-art editorial feel, ultra-detailed.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no interface elements, no borders, no watermarks.\n\nAvoid: blurred face, distorted face, altered face, changed identity, generic face, missing glasses, recolored clothing on body, extra limbs, extra fingers, merged bodies, scenery, room, landscape, text, logo, watermark, cartoon, anime, 3D render.",
  },

  'caricature-reveal': {
    label: "Holding my caricature",
    blurb: "Real you, holding a hand-drawn caricature of you",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Create an ultra-photorealistic portrait of the person (or people) from the reference photo, holding a large hand-drawn caricature of themselves.\n\nIDENTITY: Recreate exactly the same person with absolute facial fidelity: precise facial geometry, eyes, eyebrows, nose, lips, jawline, beard density and shape, hairstyle, hair color, glasses, skin tone, natural skin texture, facial asymmetry, and every distinctive characteristic, so the identity remains instantly recognizable, with zero facial reinterpretation or beautification. Keep their original facial expression.\n\nOUTFIT: Keep each person's actual clothing from the photo, with its colors, patterns, and cut, plus their jewelry and accessories, detail for detail.\n\nPOSE: A relaxed, authentic, candid medium shot with natural body language, slightly shifted weight, and relaxed shoulders. Both hands are fully visible, with natural, correct fingers, comfortably holding a large white artist's drawing sheet facing the camera at chest height, without covering the face.\n\nTHE CARICATURE: The drawing sheet takes up a large portion of the composition and shows an exhibition-quality, hand-drawn graphite caricature of the same person, wearing the same outfit, by a world-class caricature artist. It keeps an unmistakable likeness while playfully exaggerating that person's own most distinctive features (their signature smile, hairstyle, glasses, eyebrows, or expression), with a big expressive head on a small body. Warm-hearted and flattering in spirit, never mocking. It must look genuinely hand-drawn: confident pencil strokes, refined graphite shading, visible paper grain, and natural sketch texture, never digitally warped or AI-distorted.\n\nSETTING: Keep the original setting from the photo as a softly blurred background with shallow depth of field.\n\nLIGHTING & QUALITY: Ultra-realistic, flattering portrait lighting with physically accurate shadows, authentic fabric textures, lifelike eye reflections, realistic skin detail, cinematic color grading, and premium editorial portrait photography quality.\n\nMULTIPLE PEOPLE: If there are multiple people, they hold one large drawing sheet together, showing a single caricature of all of them in the same arrangement as the photo, with each person exaggerated individually.\n\nTEXT: No signature or text on the drawing.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no logos, no borders, no watermarks.\n\nAvoid: beautified face, altered face, changed identity, generic face, changed expression, changed outfit, uniform clothing, smoothed plastic skin, distorted hands, extra fingers, sheet covering face, digital-looking caricature, AI-warped drawing, colored drawing, mean or grotesque caricature, unrecognizable caricature, text, signature, logo, watermark, 3D render, cartoon person.",
  },

  'candy-dispenser': {
    label: "Candy dispenser toy",
    blurb: "You as a vintage collectible candy dispenser",
    needs: [],
    buildPrompt: () =>
      "Use the reference image for the subject only.\n\nTransform the person (or people) into an authentic-looking vintage collectible candy-dispenser toy, preserving their instantly recognizable identity. Capture their defining facial features, face shape, skin tone, eye color, hairstyle, hair color, expression, facial hair, glasses, earrings, and hats or accessories, then reinterpret them as a stylized collectible toy head.\n\nTOY DESIGN:\n- The head is manufactured from glossy injection-molded plastic with smooth, simplified forms, subtle mold seams, toy-safe proportions, and realistic plastic reflections. Hair is sculpted as a single molded plastic piece with defined grooves\n- Classic flip-top candy-dispenser construction: an oversized character head on a hinge, attached to a slim rectangular plastic stem\n- The stem is colored to match the person's main clothing color, with a small molded collar, neckline, or tie detail at the top echoing their actual outfit\n- It should feel like a mass-produced retail collectible from the 1990s or early 2000s, not a custom toy or 3D print. No brand names, logos, or trademarks anywhere on the toy\n\nPROPS: A sealed packet of fruit-flavored candy refills lies beside the dispenser, with retro unbranded packaging in bright colors.\n\nSCENE: Show the entire dispenser from head to base in full view, standing on a real toy store shelf from the late 1990s or early 2000s: desaturated colorful shelving, classic unbranded toy packaging, nostalgic retail signage with no readable brand names, slightly blurred shelves of toys behind it, cheerful department-store lighting, and an authentic vintage retail atmosphere. The dispenser stands at a slight angle, centered, as the clear hero of the image.\n\nMULTIPLE PEOPLE: If there are multiple people, create a separate dispenser for each person, standing side by side on the shelf in the same arrangement as the photo.\n\nPHOTOGRAPHY: Commercial product photography: crisp focus, shallow depth of field, highly realistic materials, realistic light, slight camera grain, vibrant nostalgic color palette, subtle ground shadow, premium collectible photography.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no watermarks.\n\nAvoid: brand name, logo, trademark, embossed branding, licensed character, readable brand signage, generic toy face, altered identity, changed hairstyle, missing glasses, missing facial hair, human body, full figure, 3D print texture, handmade look, cartoon illustration, flat 2D, watermark.",
  },

  'vinyl-figure': {
    label: "Vinyl figure",
    blurb: "A chibi collectible toy of you on a studio backdrop",
    needs: [],
    buildPrompt: () =>
      "Transform the person (or people) in this photo into a 3D collectible designer vinyl toy figure.\n\nPreserve each person's exact identity markers from the reference image: skin tone, face shape, hairstyle, hair color and texture, eyebrows, facial hair, glasses, makeup, and any distinguishing features. Keep their exact pose, gesture, expression, and what they are doing. Reproduce their clothing, colors, patterns, shoes, jewelry, and accessories detail for detail. Only the rendering style changes.\n\nStyle:\n- Stylized chibi proportions: oversized head, small rounded body, short limbs, full body visible from head to shoes\n- Simple, minimal face: solid black oval eyes, small clean eyebrows, subtle nose, mouth simplified or hidden if covered by an object\n- Smooth matte vinyl/soft-touch plastic finish, with hair sculpted as thick, defined, glossy clumps\n- Clothing sculpted with soft, realistic fabric folds; jewelry and metal accessories in polished metallic finish\n- Objects the person is holding or interacting with (food, drinks, flowers, phones, bouquets, etc.) stay richly detailed and near-photorealistic, scaled to the figure\n- If there are multiple people, make each one a separate figure, standing together on the same backdrop, with the same interaction between them as in the original\n\nScene:\n- Remove the original background entirely\n- Plain seamless studio backdrop in a soft, warm neutral tone that complements the figure's colors\n- Soft, diffused studio lighting with gentle highlights and a soft contact shadow under the feet\n- Product-photography look, centered composition, ultra-detailed 3D render\n\nOutput a single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no username, no watermark, no borders, no packaging.\n\nAvoid: inset image, picture-in-picture, before/after, collage, text, username, watermark, logo, packaging box, realistic human face, detailed realistic eyes, anime, 2D illustration, flat cartoon, glossy plastic skin, cluttered background, changed hairstyle, changed outfit, missing accessories, extra fingers, distorted hands.",
  },

  'chibi-palm': {
    label: "Tiny me (cheek poke)",
    blurb: "A grumpy mini you standing on a giant palm",
    needs: [],
    buildPrompt: () =>
      "Create a tiny, cute, super-deformed chibi character based exactly on the person (or people) in the reference photo, standing calmly on an open realistic human palm.\n\nIDENTITY: Preserve each person's recognizable identity in chibi form: face shape, skin tone, eye color, eyebrow shape, hairstyle, hair texture, hair color, and any glasses, facial hair, freckles, moles, or dimples. Keep their actual clothing, with its colors and patterns, plus their shoes (inferred if not visible), jewelry, and accessories, recreated in miniature detail for detail. Each person must be instantly recognizable as their chibi self.\n\nCHARACTER: Super-deformed proportions with a very oversized head and tiny body, about 2.5 heads tall. High-detail 3D chibi rendering with smooth, soft textures, soft pastel tones, glossy expressive eyes, and hair sculpted in soft, defined clumps.\n\nACTION: An open left hand holds the character in the center of the frame, with realistic human-hand scale contrast. A right hand enters from the side, its index finger gently pressing into the character's cheek and squishing it. Both hands belong to the same person: photorealistic, with a natural, consistent skin tone, correct anatomy, and exactly five fingers each.\n\nEXPRESSION: The character reacts with an annoyed, grumpy expression: puffed cheeks, slight frown, narrowed eyes, and a subtle irritated pose with arms stiff or crossed.\n\nSCENE: A softly blurred, warm, neutral background with creamy shallow depth of field, clean soft lighting, and strong focus on the character's face and the finger poke.\n\nMULTIPLE PEOPLE: If there are multiple people, all of them stand side by side on the palm as chibis, keeping their relative positions. The finger pokes one person's cheek while the others react (laughing, surprised, or also grumpy).\n\nOUTPUT: A single full-frame vertical image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: realistic human-proportioned body, uncanny realistic face on chibi, anime 2D, flat illustration, changed outfit, generic outfit, changed hairstyle, missing glasses, altered identity, extra fingers, missing fingers, malformed hands, mismatched hand skin tones, three hands, finger covering the face, cluttered background, text, logo, watermark.",
  },

  'block-print': {
    label: "Block print journal",
    blurb: "Linocut engraving on a cream journal page",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a hand-printed \"block print\" journal page illustration.\n\nPreserve the exact facial identity, likeness, and body proportions of every person from the reference image. Keep each person's pose, gesture, clothing, accessories, hairstyle, and position exactly as in the original, including how they interact with each other. Render them faithfully, detail for detail. Only the rendering style changes.\n\nStyle:\n- Render the people as a detailed black-and-white linocut / scratchboard engraving, with fine cross-hatching, etched line work, and crisp white highlights carved out of black ink\n- Remove the original background and replace it with a solid black ink block: a roughly square block-printed rectangle with distressed, uneven, hand-stamped edges and subtle ink texture\n- Place the people in front of the black block, with their lower bodies or feet breaking out past the bottom edge of the block onto the paper, grounded by a small hand-hatched ink shadow\n- Set the whole composition on warm off-white, cream, textured printmaking paper with soft grain\n\nJournal layout (hand-lettered in black ink, casual marker/brush handwriting):\n- Top left: a short 2-3 word uppercase title that captures the mood of the scene, with a small lowercase three-word tagline beneath it\n- Top right: small GPS-style coordinates\n- Bottom left: a short 2-word uppercase heading in spaced lettering ending with a period, followed by one short, heartfelt lowercase caption line about the moment\nKeep all text short, legible, and correctly spelled. Leave generous negative space so it feels like a minimalist zine or travel diary page.\n\nOutput a single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no borders beyond the paper itself, no watermarks, no color except black ink on cream paper.\n\nAvoid: color, photograph, photorealistic background, inset image, picture-in-picture, before/after, collage, watermark, logo, misspelled text, gibberish text, altered face, changed identity, cartoon face, anime, distorted hands, extra limbs, clean digital vector look.",
  },

  'soft-terrain': {
    label: "Soft terrain",
    blurb: "Thousands of flowing lines sculpt the scene",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a \"soft terrain\" line-displacement artwork.\n\nPreserve the exact composition, framing, camera angle, and every subject from the reference image. If people are present, preserve their exact facial identity, likeness, pose, gesture, clothing silhouette, hairstyle, and position, using denser, finer lines around faces and hands so their features stay clearly recognizable. Only the rendering style changes.\n\nStyle:\n- Recreate the entire image using thousands of thin, continuous, parallel horizontal lines that flow across the full frame\n- The lines bend, ripple, rise, and compress to sculpt every form, like a topographic contour map or a 3D height field, so shapes appear embossed and dimensional\n- Brightness is expressed through line thickness and spacing: highlights become luminous, glowing white lines packed tightly together; shadows become sparse, thin, darker lines\n- Keep the original photo's color palette and lighting mood, rendered as soft gradients flowing through the lines\n- Reflections, water, sky, and backgrounds are also built from the same horizontal lines, gently waving and softer\n- Smooth, calm, meditative, minimal fine-art feel. Clean, precise, high resolution\n\nTypography (tiny, thin, uppercase sans-serif with very wide letter spacing, one word per line, in a soft light tone that matches the palette, each block finished with a short thin underline rule):\n- Top left: a short three-line poetic phrase about the scene\n- Top right, right-aligned: a short four-line poetic phrase\n- Bottom left: a short three-line poetic phrase\nKeep the text understated, small, correctly spelled, and in the margins so it never covers the subjects.\n\nOutput a single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no borders, no watermarks.\n\nAvoid: photograph, photorealistic texture, inset image, before/after, collage, watermark, logo, large text, bold text, misspelled text, gibberish text, vertical lines, crosshatching, broken or jagged lines, noise, grain, altered face, changed identity, distorted hands, extra limbs.",
  },

  'cross-stitch': {
    label: "Cross-stitch",
    blurb: "The whole photo stitched as a pixel mosaic",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a high-resolution cross-stitch pixel mosaic.\n\nPreserve the exact composition, framing, camera angle, lens perspective, and lighting of the reference image. Preserve the exact facial identity, likeness, expression, pose, gesture, hairstyle, skin tone, clothing, accessories, and position of every person. Keep all objects, logos, signage, and background elements where they are, and keep their colors. Only the rendering style changes.\n\nStyle:\n- Rebuild the entire image, subjects and background alike, from a fine, uniform grid of small square pixels/stitches, roughly 150-200 stitches across the width\n- Each square has a subtle embroidered thread texture, like cross-stitch or needlepoint, with tiny gaps between stitches showing a faint woven fabric grid\n- Use a rich but limited color palette, like embroidery floss colors, with clean color blocking and smooth stepped gradients\n- Faces and hands get careful color placement so features, eyes, and expressions stay clearly readable and recognizable\n- Textures in the original (quilting, fabric folds, hair strands, reflections, lights, signs) are translated faithfully into the stitch grid\n- Vibrant, saturated colors, crisp edges, no blur, ultra-detailed\n\nOutput a single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no borders, no embroidery hoop, no visible fabric edges, no watermarks.\n\nAvoid: inset image, before/after, collage, watermark, embroidery hoop, frame, blurry, smooth photographic areas, low resolution chunky 8-bit pixels, retro video game sprite, dithering noise, altered face, changed identity, distorted hands, extra limbs, changed composition.",
  },

  'stitch-postcard': {
    label: "Stitch postcard",
    blurb: "Fabric appliqué and embroidery on linen",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a handmade \"stitch postcard\": a fabric appliqué and hand-embroidery artwork on natural linen.\n\nPreserve the exact facial identity, likeness, expression, pose, gesture, hairstyle, hair color, skin tone, clothing, colors, patterns, and accessories of every person from the reference image, along with any objects, pets, or props they are holding or interacting with. Keep their exact position and how they interact with each other. Only the rendering style changes.\n\nStyle:\n- Remove the original background entirely and replace it with plain, unbleached oatmeal linen fabric with a visible natural weave\n- Render the people and key objects as layered fabric appliqué: cut pieces of cotton, felt, denim, wool, and knit fabric that match the original colors and textures, sewn onto the linen\n- Edges finished with visible hand stitches (blanket stitch, running stitch, whip stitch) in matching or slightly darker thread; slightly frayed fabric edges\n- Hair embroidered with dense, flowing satin-stitch and long thread strands; faces made from skin-toned fabric with small, delicate embroidered features (eyes, brows, lips, freckles) so the person stays recognizable\n- Fine details (stripes, logos, folds, shoelaces, jewelry, fur) added with embroidery thread\n- Slight raised, tactile, dimensional look with soft natural daylight and gentle shadows under the fabric layers\n- Composition centered with generous empty linen around the subjects\n\nDecorations (all hand-embroidered in thin dark brown or charcoal thread, small and sparse):\n- A tiny outlined heart near the subject's head\n- A small leaf sprig or botanical doodle near the subject\n- A short two-word handwritten phrase in casual lowercase script that matches the mood of the scene, with a short stitched underline\n- In the bottom right corner, a small rectangular fabric label patch sewn on with running stitch, embroidered with a date in YYYY.MM format and a tiny cross-stitch X beside it\n\nOutput a single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no before/after labels, no embroidery hoop, no borders, no watermarks.\n\nAvoid: inset image, before/after, collage, watermark, logo, embroidery hoop, photorealistic background, digital painting, flat vector, cartoon, anime, smooth plastic, printed fabric look, misspelled text, gibberish text, altered face, changed identity, distorted hands, extra limbs.",
  },

  'sumi-e': {
    label: "Sumi-e ink painting",
    blurb: "Japanese ink wash on rice paper with a red seal",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a traditional Japanese sumi-e ink wash painting on rice paper.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone value, facial features, expression, hairstyle, hair texture, hair length, body build, and any glasses, facial hair, or distinguishing marks. Keep their exact pose, gesture, gaze direction, framing, and position, along with their clothing, its cut and silhouette, and accessories, including anything they are holding (phone, bag, drink, bouquet). Keep the original composition and camera angle. Only the rendering style changes.\n\nSTYLE:\n- Black sumi ink only, in a full range of values from deep black to pale gray washes; no color except the red seal\n- People painted with the most care and detail: confident brush outlines, refined facial features, hair in flowing, expressive ink strokes, and clothing folds built with layered washes and dry-brush texture\n- Background rendered much more loosely: the original setting suggested with bold, spontaneous brushstrokes, soft bleeding washes, ink splashes, and streaky dry-brush marks that fade into empty paper\n- Reflections, light, and atmosphere shown through wet washes and negative space\n- Generous areas of blank paper; edges of the scene dissolve and vignette into the paper\n- Warm, off-white rice paper / washi texture with subtle fibers throughout\n\nCALLIGRAPHY & SEAL: In the lower right, the vertical brush-written Japanese calligraphy \"永遠\" (eternity), with a small square red hanko seal stamp beneath it bearing the character \"愛\".\n\nMULTIPLE PEOPLE: If there are multiple people, paint each one with equal care, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no other text, no logos, no borders, no watermarks.\n\nAvoid: color, colored ink, watercolor colors, photorealism, 3D render, anime, manga, digital painting look, clean vector lines, cluttered background, fully filled background, altered face, changed identity, generic face, changed outfit, missing accessories, extra fingers, distorted hands, extra limbs, watermark, logo, border, English text.",
  },

  'neo-noir-ink': {
    label: "Razor ink noir",
    blurb: "Gritty graphic-novel inks in burnt orange",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a \"razor ink neo-noir caricature\": a gritty graphic-novel ink illustration.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, expression, hairstyle, hair texture, hair color, and any glasses, facial hair, tattoos, freckles, or distinguishing marks. Keep their exact pose, gesture, gaze direction, framing, and position, along with their clothing, accessories, and any graphics or prints on clothing. Only the rendering style changes.\n\nCARICATURE: Lightly exaggerate each person's most distinctive features and amplify their expression by about 15-20% for character and energy, while keeping them instantly recognizable. No grotesque distortion.\n\nSTYLE:\n- Razor-sharp, confident black ink linework with aggressive variation from thick bold strokes to fine scratchy lines\n- Dense, energetic cross-hatching and directional hatching for shadows, form, and texture, especially on faces, hair, and fabric folds\n- Deep, hard-edged noir shadows with strong chiaroscuro contrast\n- Hair drawn as wild, expressive ink strokes that keep the real hairstyle\n- Limited, nearly monochrome palette: burnt orange, rust, terracotta, and deep brown, with warm cream for highlights and solid black ink\n- Slightly rough, hand-inked, printed-comic texture with occasional ink spatter\n\nBACKGROUND: Keep the original setting and composition, but reduce it to loose, simplified, sketchy ink shapes and silhouettes in the same rust-orange palette, less detailed than the subjects so the people dominate.\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal detail, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: text, logo, watermark, photorealism, 3D render, anime, chibi, soft airbrushed shading, smooth gradients, full color, pastel, grotesque distortion, altered face, changed identity, generic face, changed hairstyle, missing accessories, extra fingers, distorted hands, extra limbs.",
  },

  'comic-cover': {
    label: "Vintage comic cover",
    blurb: "You starring on a 1950s-60s teen comic cover",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Transform this photo into the cover of a vintage 1950s-60s American teen comic book, starring the person (or people) from the photo as the cover character.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eye shape, eyebrows, nose, lips, expression, hairstyle, hair texture, hair color, and any glasses, facial hair, freckles, or distinguishing marks. Keep their clothing, colors, patterns, and accessories accurate, restyled with a retro flair. Keep their original expression. If the full pose is visible, keep it; otherwise give a natural, confident cover pose consistent with the visible upper body. Each person must be instantly recognizable.\n\nART STYLE:\n- Classic vintage comic book illustration with bold, clean black ink outlines and confident brush linework\n- Flat, saturated retro colors (cherry red, sky blue, sunny yellow, teal, cream) with simple cel shading\n- Visible halftone dot texture, slight color misregistration, and aged, yellowed, lightly worn paper with soft creases at the edges\n- Faces drawn in an appealing classic comic style while staying true to each person's real features\n\nBACKGROUND: Keep the original setting, redrawn as a cheerful retro comic scene. If the original background is plain or a studio backdrop, invent a fitting nostalgic mid-century scene (a classic diner, a vintage convertible, a small-town street, a soda shop, a backyard party) with puffy clouds and blue sky.\n\nCOVER LAYOUT:\n- Top: a big, bold, bouncy hand-lettered title logo in red with a yellow drop-shadow and thick black outline reading \"MOMENT SHARE COMICS\"\n- Top left corner: a small box with \"NO. 1\" and \"$1.25\", and a tiny portrait bust of the main character\n- A small banner above the title with a short, witty tagline\n- One speech bubble from the character with a short, deadpan, funny line (under 8 words) suited to the scene\n- One or two short, funny background signs (under 4 words each)\n- Bottom left: a small retro barcode box\nKeep all text short, bold, legible, and correctly spelled.\n\nMULTIPLE PEOPLE: If there are multiple people, all of them appear on the cover as the stars, keeping their relative positions and interaction from the photo, with each one drawn individually.\n\nOUTPUT: A single full-frame portrait-orientation comic cover only. No inset, no picture-in-picture, no thumbnail of the original photo, no real publisher logos, no approval seals, no watermarks.\n\nAvoid: inset photo, thumbnail of original, before/after, real publisher logo, comics code seal, approval stamp, watermark, photorealism, 3D render, anime, manga, modern digital art, clean glossy finish, misspelled text, gibberish text, long text, too many speech bubbles, altered face, changed identity, generic face, changed hairstyle, extra fingers, distorted hands, extra limbs.",
  },

  'rubber-hose-portrait': {
    label: "1930s cartoon",
    blurb: "Vintage rubbery cartoon portrait on pink",
    needs: [],
    buildPrompt: () =>
      "Transform the person (or people) in this photo into a vintage 2D rubbery cartoon portrait inspired by classic 1930s hand-drawn animation. Create an original cartoon version of the real person, not any existing cartoon character.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose and lip shape, expression, hairstyle, hair length, hair color, and any glasses, facial hair, freckles, moles, or dimples. Keep their clothing, colors, and accessories (earrings, necklaces, hats) accurately. Exaggerate features in a cartoon way, but each person must remain instantly recognizable.\n\nSTYLE:\n- Exaggerated but faithful facial construction with elastic, curved, rubbery forms and bouncy shapes\n- Expressive, oversized eyes with large irises in the subject's real eye color and bright white highlights\n- Bold, hand-inked black contour lines with natural thick-to-thin brush variation\n- Hair drawn as big, flowing, rhythmic shapes with ink-line strands, keeping the real hairstyle\n- Simple cel shading, rosy cheek blush, slightly rough vintage print and paper texture\n- Limited, warm, nostalgic color palette for shading, clothing tones, and background, with skin, hair, and eye colors staying true to the person\n- Energetic, charming 1930s cartoon illustration feel\n\nCOMPOSITION: Head and shoulders portrait only, centered. If there are multiple people, include each one as a separate cartoon figure, close together, keeping their relative positions and interaction from the photo. Solid, flat, saturated pink background that contrasts with the subjects.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no borders, no text, no watermarks.\n\nAvoid: existing cartoon character, mascot, photorealism, 3D render, anime, modern flat vector, gradients, airbrushed, changed skin tone, changed hair color, changed eye color, altered face, generic face, missing accessories, missing glasses, extra fingers, distorted hands, text, logo, watermark.",
  },

  'animated-character': {
    label: "Animated series character",
    blurb: "Flat cut-paper cartoon caricature",
    needs: [],
    buildPrompt: () =>
      "Create a stylized character design for a modern Western animated series based on the attached photo. Chest-up portrait, three-quarter view, looking at the camera. This is an exaggerated cartoon caricature, NOT a realistic portrait.\n\nSUBJECTS: If there is one person, create one character. If there are multiple people, create each as a separate character in the same style, arranged together with the same relative positions and interaction as the original photo.\n\nSTYLE: Oversized head (1.5x normal), stylized elongated neck, angular shoulders that keep the person's real build, large almond-shaped eyes with big irises, thick raised eyebrows, tiny simplified nose, and minimal facial features. Preserve the subject's exact expression and recognizable identity.\n\nIDENTITY: Keep the person's face shape, jawline, eye color, eyebrow shape, skin tone, age, hairstyle, parting, length, and hair color. Include glasses, facial hair, freckles, moles, dimples, and other distinguishing features as simplified flat shapes. Reproduce clothing and genuine accessories (jewelry, hats, headbands) accurately. Add nothing that isn't in the photo.\n\nFLAT COLORS ONLY: Skin exactly 2 tones (base + shadow), plus the blush and highlight below as the only exceptions. Hair exactly 2 tones. Clothing 2-3 tones maximum. Use sharp, angular, cut-paper shadow shapes with no gradients, blending, textures, or extra shading. Shadows are rich, dark versions of their base colors.\n\nHAIR & DETAILS: Hair consists of 2-3 solid angular shapes, without individual strands. Add simple flat blush patches on cheeks and nose, plus one geometric forehead highlight. Hands, if visible, are simplified with clear, correct finger count; otherwise crop them out of frame.\n\nOUTLINES: Variable-thickness dark burgundy or dark brown outlines, thick outside and thin or absent inside. Outlines are never black. Pupils and genuinely black hair or clothing may still use deep dark tones.\n\nBACKGROUND: One tilted, saturated-color polygon behind the character(s), partially hidden by the head and shoulders, on a clean white background.\n\nPALETTE & COMPOSITION: Rich, vivid, highly saturated colors for clothing, hair, and background, with skin tone true to the subject's real skin tone. Strong color contrast. The head dominates the frame, with exaggerated cartoon proportions and clean, bold shapes.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no borders.\n\nAvoid: photorealism, anime, 3D, gradients, soft shadows, extra skin tones beyond those listed, lightened or darkened skin, realistic anatomy, detailed facial rendering, individual hair strands, textures, noise, added or missing accessories, missing glasses or facial hair, altered expressions, extra fingers, text, logos, watermarks.",
  },

  'indie-doodle': {
    label: "Indie doodle toon",
    blurb: "Flat zine-style cartoon with doodle stickers",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into an \"indie doodle toon\": a flat, minimal indie-comic / zine-style illustration.\n\nIDENTITY: Preserve each person's recognizable identity from the reference image: their real skin tone (rendered as a flat color that matches it), face shape, hairstyle, hair texture, hair color, eyebrow shape, and any glasses, facial hair, freckles, or distinguishing marks. Keep their exact pose, gesture, head tilt, gaze direction, framing, and position, along with their clothing, its colors, and accessories. Simplify their expression into the style, but keep its mood.\n\nSTYLE:\n- Thick, uniform, slightly wobbly hand-drawn black outlines around every shape\n- Completely flat color fills, with no gradients or texture; at most one simple hard-edged shadow shape (for example under the chin or neck)\n- Minimal face: small solid oval or vertical-line eyes, short simple eyebrows, tiny nose line, small simple mouth\n- Hair simplified into chunky rounded blob or cloud shapes that keep the real hairstyle and texture, with a few small flat highlight dashes\n- Clothing simplified into clean flat shapes with a few hand-drawn details (seams, frayed edges, buttons)\n- Small playful doodle accents, such as tiny stars, a smiley face, hearts, or sparkles, drawn as cute patches or pins on clothing, or floating lightly in the background\n- Warm, cheerful, slightly muted retro palette\n\nBACKGROUND: Remove the original background and replace it with a single solid flat color that complements the subject, such as warm orange, peach, mustard, or soft teal.\n\nMULTIPLE PEOPLE: If there are multiple people, draw each one in the same style, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: text, logo, watermark, photorealism, 3D render, anime, detailed realistic eyes, gradients, soft shading, airbrushed, textures, changed skin tone, lightened skin, darkened skin, changed hair color, changed hairstyle, missing glasses, cluttered background, extra fingers, distorted hands.",
  },

  'rubber-hose-poster': {
    label: "1930s carnival poster",
    blurb: "Bendy-limbed cartoon on a screen-printed stage",
    needs: [],
    buildPrompt: () =>
      "Transform the person (or people) in this photo into a 1930s rubber-hose cartoon character, presented as a hand-drawn, screen-printed vintage carnival poster.\n\nIDENTITY: Preserve each person's recognizable identity in cartoon form: face shape, skin tone, hairstyle, hair color, eyebrow shape, nose shape, facial hair, glasses, and distinguishing features. Keep their actual clothing, its cut, colors, and patterns, plus accessories, simplified into bold cartoon shapes. Do not add hats or accessories that are not in the photo. Their expression is an exaggerated cartoon version of their real expression (a smile becomes a big beaming grin, a serious look becomes comic determination). Each person must be instantly recognizable.\n\nCHARACTER STYLE:\n- Classic 1930s rubber-hose animation design: bendy, boneless noodle limbs, a slightly large rounded head, and simplified features\n- Large round cartoon eyes with irises in the person's real eye color and a white highlight dot\n- White four-fingered cartoon gloves\n- A bouncy, energetic, mid-stride action pose with one fist raised, loosely based on their original pose\n- Thick, confident, bold black outlines with no gradients; flat color fills only\n\nBACKGROUND: A 1930s carnival stage: heavy red-and-white velvet curtain swags at the top edges, large cream starburst shapes radiating from the corners, spinning sunburst platform wheels in the mid-ground, and a dramatic radiating-lines backdrop behind the character.\n\nPRINT FINISH:\n- A deliberately limited four-color screen-print palette: cream parchment, jet black, bright red, and warm yellow, with skin and hair tones approximated as closely as the palette allows\n- Visible halftone dot shading, slight print misregistration, ink texture, and worn, aged poster paper with faint creases and scuffs\n\nMULTIPLE PEOPLE: If there are multiple people, each one becomes their own rubber-hose character on the same stage, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: existing cartoon character, mascot, generic cartoon face, same face on everyone, added hat, added accessories, changed hairstyle, missing glasses, missing facial hair, changed outfit, gradients, soft shading, 3D render, photorealism, anime, modern flat vector, full color palette, text, logo, watermark, extra limbs.",
  },

  'anime-90s': {
    label: "'90s anime",
    blurb: "Hand-painted cel look with film grain",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a 1990s anime cel illustration, in the style of late-'80s and '90s hand-painted Japanese TV and OVA animation.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eye shape, eyebrows, nose, lips, expression, hairstyle, hair texture, hair color, facial hair, glasses, and distinguishing marks. Keep realistic, mature facial proportions with no oversized eyes. Keep their exact pose, head angle, gaze direction, framing, clothing, colors, and accessories. Each person must be instantly recognizable.\n\nSTYLE:\n- Hand-drawn cel animation look with clean, confident ink linework of slightly varied weight\n- Angular, defined facial structure: sharp jawline and cheekbones, a defined nose bridge, and expressive, realistically shaped eyes with a single bold highlight\n- Hard-edged cel shading in 2 tones with crisp shadow shapes, plus a few sharp highlight shapes on hair, skin, and clothing\n- Hair drawn as bold, spiky or flowing clumps with sharp ends, keeping the real hairstyle\n- A muted, slightly faded retro palette with warm skin tones, deep burgundies, olive greens, dusty blues, and a subtle warm-sepia color cast\n\nBACKGROUND: Keep the original setting, rendered as a hand-painted '90s anime background with soft, textured gouache brushwork, slightly muted and less detailed than the characters.\n\nFINISH: Analog film grain, slight cel-paint texture, gentle color fading, and a soft vignette, like a frame captured from a '90s anime on film.\n\nMULTIPLE PEOPLE: If there are multiple people, draw each one with distinct, individual features as in the photo, keeping their relative positions and interaction.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no graffiti text, no logos, no borders, no watermarks.\n\nAvoid: modern anime, moe style, chibi, oversized anime eyes, glossy digital shading, soft gradients, airbrushed, 3D render, photorealism, western cartoon, generic anime face, same face on everyone, altered face, changed identity, changed skin tone, changed hairstyle, missing glasses, missing facial hair, added text, graffiti words, logo, watermark, extra fingers, distorted hands.",
  },

  'anime-summer': {
    label: "Summer anime",
    blurb: "Semi-real anime under a big summer sky",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a nature-themed anime portrait illustration.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eye shape, eyebrow shape, nose, lips, expression, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, freckles, tattoos, or distinguishing marks. Keep realistic facial proportions with no oversized anime eyes. Keep their exact pose, gesture, gaze direction, framing, and position, along with their clothing, colors, patterns, and accessories. Keep any key objects or props they are with (vehicles, bikes, instruments, pets, bouquets) in place.\n\nSTYLE:\n- Semi-realistic modern anime / manga illustration with clean, confident ink linework\n- Crisp cel shading with two to three tone steps and sharp, defined highlight shapes on skin, hair, fabric, and metal\n- Hair drawn in defined, flowing anime-style clumps that keep the real hairstyle\n- Bright, saturated, fresh color palette with warm sunlight and soft cool shadows\n- Detailed rendering of clothing folds, textures, and reflective surfaces\n\nSETTING: Keep the original background and setting, redrawn in the same anime style, with the sky (if visible) turned vivid blue with big sunlit cumulus clouds and any greenery made lush and vibrant.\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal detail, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: photorealism, 3D render, chibi, oversized anime eyes, moe style, generic anime face, altered face, changed identity, changed skin tone, changed hairstyle, changed outfit, missing accessories, missing props, extra fingers, distorted hands, extra limbs, gloomy weather, night, text, logo, watermark.",
  },

  'monster-tamer': {
    label: "Monster tamer anime",
    blurb: "Anime hero summoning an original creature partner",
    needs: [],
    buildPrompt: () =>
      "A single cohesive full-body anime frame in a classic late-'90s/2000s TV adventure-anime style, with everything drawn in the same hand-drawn 2D cel-shaded look. The person (or people) from the uploaded reference photo is reimagined as a full-body anime monster-tamer hero, mid-action: running forward with one arm thrust out, summoning their partner creature through a glowing circular energy sigil in the air.\n\nIDENTITY: Translate each person's real features faithfully into anime so they are clearly recognizable as an anime version of the same individual: keep face shape, skin tone, hairstyle, hair color, facial hair, glasses if any, eye color, and body proportions. No generic anime face. Keep their actual outfit, its colors, and accessories, adapted into an adventurer look with a small backpack and fingerless gloves.\n\nPARTNER CREATURE: An original, invented, cute but brave creature companion, about knee height: a fox-like creature with oversized ears, a fluffy tail tipped with soft glowing light, and big expressive eyes, in colors that complement the hero's outfit. It dashes alongside the hero, trailing sparkling light particles. It must not resemble any existing game or anime creature.\n\nSCENE: A vibrant battle on a sunny grassy field, with kicked-up dust, swirling energy effects, a bright anime sky with big clouds, and a blurred stadium crowd in the background.\n\nSTYLE: Classic TV-anime cel shading with clean outlines, flat colors with one shadow tone, bright saturated palette, consistent anime lighting, dynamic action lines, and the full body in frame.\n\nMULTIPLE PEOPLE: If there are multiple people, each is their own hero with their own original creature companion, charging forward together.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no watermarks.\n\nAvoid: existing game creature, existing anime creature, franchise mascot, yellow electric mouse, red and white capture ball, franchise logo, generic anime face, same face on everyone, oversized moe eyes, chibi, altered identity, changed hairstyle, changed skin tone, missing glasses, missing facial hair, 3D render, photorealism, text, logo, watermark.",
  },

  'game-key-art': {
    label: "Game key art",
    blurb: "Hand-painted open-world game poster at sunset",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into polished, hand-painted, open-world video-game key art, like an official promotional illustration.\n\nIDENTITY: Preserve every person's exact identity and likeness: face shape, skin tone, eye color, facial features, expression, hairstyle, hair color, facial hair, glasses or sunglasses, tattoos, body build, and distinguishing marks. Keep their pose, gesture, gaze direction, clothing, colors, accessories, and the original composition, including objects in frame (microphones, drinks, bouquets, vehicles). Do not idealize, slim, or reshape anyone.\n\nSTYLE: Medium detail with simplified facial planes, clean, defined edges, graphic color blocking, flat-to-semi-flat painted shading, and simplified hair and textures. Realistic proportions, but clearly illustrated, not photorealistic.\n\nCOLOR & LIGHT: A vibrant tropical sunset palette of pink, purple, turquoise, and orange, with strong golden rim lighting on hair, shoulders, and edges and cool violet shadows. Skin tones stay true to each person beneath the colored lighting.\n\nBACKGROUND: Keep the original setting, reimagined in the same painted style under a glowing sunset sky, slightly simplified and less detailed than the people so they stand out.\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal care, keeping their relative positions and interaction.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no game logo, no title text, no UI, no borders, no watermarks.\n\nAvoid: skin pores, microdetail, 3D render look, photorealism, anime, grunge, chibi, flat vector, idealized body, slimmed body, altered face, changed identity, generic face, pink-tinted skin, orange-tinted skin, changed skin tone, changed hair color, missing glasses, game logo, title text, UI, text, watermark.",
  },

  'action-paint': {
    label: "Kinetic action paint",
    blurb: "Explosive foreshortened action poster",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a \"kinetic foreshortened action paint\" illustration.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, tattoos, or distinguishing marks. Keep their clothing, its colors and patterns, shoes, and accessories accurate. Keep the key objects and setting from the photo (vehicles, furniture, structures, props).\n\nPOSE & CAMERA: Keep each person's exact original pose and position, but shift to a dramatic low camera angle with strong foreshortening, so the nearest limb (a foot, knee, or hand) looms large in the foreground. Add implied energy through brushstrokes, flying debris, and dust as if the moment is about to explode into motion. Faces stay clearly visible.\n\nSTYLE:\n- Loose, energetic hand-painted digital illustration in a gouache/oil-sketch look, with visible, confident, directional brushstrokes\n- Bold, flat color blocking with crisp highlight shapes and painterly shadow planes\n- Clothing patterns simplified into expressive brush marks while keeping their real colors\n- Dynamic motion: flying debris, paint flecks, gravel, and dust clouds bursting outward; streaks suggesting speed\n- Vivid, saturated, high-contrast colors under a deep, clear cobalt-blue sky, or the original setting's palette pushed to full saturation\n- Cinematic action-poster energy, sharp focus on the face\n\nBACKGROUND: The original setting and objects, reinterpreted with loose painterly strokes and dramatic perspective, less detailed than the subject.\n\nMULTIPLE PEOPLE: If there are multiple people, keep their relative positions and interaction from the photo, with all faces clearly visible.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no borders, no watermarks.\n\nAvoid: text, logo, watermark, photorealism, 3D render, anime, chibi, flat vector, static flat composition, eye-level camera, blurred face, hidden face, altered face, changed identity, generic face, changed outfit, missing accessories, extra limbs, extra fingers, distorted hands, broken anatomy.",
  },

  'diorama-usa': {
    label: "USA diorama",
    blurb: "You on a travel diorama of American landmarks",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Create a 3D travel diorama poster featuring the person (or people) from this photo as a stylized miniature character on a round collectible display base, surrounded by iconic scenery of the United States.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose, lips, smile, expression, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, freckles, or distinguishing marks. Each person must be instantly recognizable.\n\nOUTFIT: Keep each person's actual clothing from the photo, with its colors, patterns, and cut, plus their shoes (inferred if not visible), jewelry, and accessories, detail for detail. Add one small travel prop, such as a camera, folded map, or small travel bag.\n\nPOSE: If the photo shows the full body, keep the original pose. Otherwise, use a natural, relaxed full-body pose consistent with the visible upper body and gesture, with the face toward the camera. Extend any unseen parts of the body naturally to match the visible clothing and build.\n\nCHARACTER STYLE: High-end semi-realistic 3D animated character render: softly stylized proportions with a slightly enlarged head, expressive eyes, smooth skin with subtle subsurface glow, hair sculpted in defined clumps, and realistic fabric textures and folds.\n\nDIORAMA: A circular, multi-level miniature diorama on a thick, polished dark wood display base with a carved edge and a brass nameplate on the front engraved \"USA\" in elegant serif capitals. Around and behind the character, densely detailed miniatures in layered forced perspective: the Statue of Liberty, the red-orange Golden Gate Bridge, a New York skyline with the Empire State Building, a domed capitol building, and Mount Rushmore carved into a rock outcrop. Props: a classic 1950s turquoise convertible, a vintage leather suitcase with travel stickers, a small airliner, a Route 66 highway shield sign, an American flag on a flagpole, desert cactus and palm trees. Textured stone ground with tiny scattered details. Palette: navy, red, cream, warm brass, and sunset gold.\n\nLIGHTING & BACKDROP: Warm, cinematic golden-hour lighting, gentle rim light on the character, rich shadows, and shallow depth of field. A softly blurred, warm-toned backdrop with a faint sky gradient. Ultra-detailed miniature photography look, tilt-shift realism.\n\nMULTIPLE PEOPLE: If there are multiple people, place each one on the same base as their own character, keeping their relative positions and interaction from the photo.\n\nTEXT: The only text is the engraved nameplate. Signs and banners use simple shapes or symbols instead of readable writing.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no usernames, no logos, no borders, no watermarks.\n\nAvoid: reference label, before/after, username, logo, watermark, readable text on signs, gibberish text, misspelled nameplate, flat 2D illustration, anime, chibi, plastic toy look, uncanny realistic face, generic face, altered face, changed identity, same face on everyone, changed outfit, missing glasses, missing accessories, extra fingers, distorted hands, extra limbs, floating character, cluttered unreadable composition.",
  },

  'diorama-japan': {
    label: "Japan diorama",
    blurb: "You on a travel diorama of Japan",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Create a 3D travel diorama poster featuring the person (or people) from this photo as a stylized miniature character on a round collectible display base, surrounded by iconic scenery of Japan.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose, lips, smile, expression, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, freckles, or distinguishing marks. Each person must be instantly recognizable.\n\nOUTFIT: Keep each person's actual clothing from the photo, with its colors, patterns, and cut, plus their shoes (inferred if not visible), jewelry, and accessories, detail for detail. Add one small travel prop, such as a camera, folded map, or small travel bag.\n\nPOSE: If the photo shows the full body, keep the original pose. Otherwise, use a natural, relaxed full-body pose consistent with the visible upper body and gesture, such as sitting on stone steps or standing, with the face toward the camera or gazing toward the pagoda. Extend any unseen parts of the body naturally to match the visible clothing and build.\n\nCHARACTER STYLE: High-end semi-realistic 3D animated character render: softly stylized proportions with a slightly enlarged head, expressive eyes, smooth skin with subtle subsurface glow, hair sculpted in defined clumps, and realistic fabric textures and folds.\n\nDIORAMA: A circular, multi-level miniature diorama on a thick, polished dark wood display base with a carved edge and a brass nameplate on the front engraved \"JAPAN\" in elegant serif capitals. Around and behind the character, densely detailed miniatures in layered forced perspective: a snow-capped Mount Fuji with a large setting-sun disc behind it, a multi-tiered pagoda, a red torii gate, a traditional wooden teahouse with a tiled roof, and an arched stone bridge over a small waterfall stream. Props: blooming cherry blossom trees with petals scattered on cobblestone steps, glowing paper lanterns, stone garden lanterns, a beckoning lucky-cat figurine, a small koi pond, and a sleek bullet train on a miniature track. Palette: blush pink, vermilion, warm wood brown, cream, and soft gold.\n\nLIGHTING & BACKDROP: Warm, cinematic golden-hour lighting with soft glows from the lanterns, gentle rim light on the character, rich shadows, and shallow depth of field. A softly blurred, warm peach-toned backdrop. Ultra-detailed miniature photography look, tilt-shift realism.\n\nMULTIPLE PEOPLE: If there are multiple people, place each one on the same base as their own character, keeping their relative positions and interaction from the photo.\n\nTEXT: The only text is the engraved nameplate. Lanterns, signs, and banners use decorative patterns instead of readable writing.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no usernames, no logos, no borders, no watermarks.\n\nAvoid: reference label, before/after, username, logo, watermark, readable text on signs, gibberish text, misspelled nameplate, flat 2D illustration, anime, chibi, plastic toy look, uncanny realistic face, generic face, altered face, changed identity, same face on everyone, changed outfit, missing glasses, missing accessories, extra fingers, distorted hands, extra limbs, floating character, cluttered unreadable composition.",
  },

  'diorama-china': {
    label: "China diorama",
    blurb: "You on a travel diorama of China",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Create a 3D travel diorama poster featuring the person (or people) from this photo as a stylized miniature character on a round collectible display base, surrounded by iconic scenery of China.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose, lips, smile, expression, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, freckles, or distinguishing marks. Each person must be instantly recognizable.\n\nOUTFIT: Keep each person's actual clothing from the photo, with its colors, patterns, and cut, plus their shoes (inferred if not visible), jewelry, and accessories, detail for detail. Add one small travel prop, such as a camera, folded map, or small travel bag.\n\nPOSE: If the photo shows the full body, keep the original pose. Otherwise, use a natural, relaxed full-body pose consistent with the visible upper body and gesture, with the face toward the camera or gazing toward the Great Wall. Extend any unseen parts of the body naturally to match the visible clothing and build.\n\nCHARACTER STYLE: High-end semi-realistic 3D animated character render: softly stylized proportions with a slightly enlarged head, expressive eyes, smooth skin with subtle subsurface glow, hair sculpted in defined clumps, and realistic fabric textures and folds.\n\nDIORAMA: A circular, multi-level miniature diorama on a thick, polished dark wood display base with a carved edge and a brass nameplate on the front engraved \"CHINA\" in elegant serif capitals. Around and behind the character, densely detailed miniatures in layered forced perspective: a winding section of the Great Wall over green hills, the round triple-roofed Temple of Heaven, a red Forbidden City gate with golden roof tiles, a stone pagoda, and misty karst mountains with a bamboo raft on a river. Props: rows of glowing red silk lanterns, a pair of stone guardian lion statues, a curving red bridge over a lotus pond, bamboo groves, a giant panda figure munching bamboo, and a small dragon boat. Stone-paved ground with scattered petals. Palette: imperial red, gold, jade green, cream, and dark lacquer brown.\n\nLIGHTING & BACKDROP: Warm, cinematic golden-hour lighting with soft glows from the lanterns, gentle rim light on the character, rich shadows, and shallow depth of field. A softly blurred, warm-toned misty backdrop. Ultra-detailed miniature photography look, tilt-shift realism.\n\nMULTIPLE PEOPLE: If there are multiple people, place each one on the same base as their own character, keeping their relative positions and interaction from the photo.\n\nTEXT: The only text is the engraved nameplate. Lanterns, signs, and banners use decorative patterns instead of readable writing.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no usernames, no logos, no borders, no watermarks.\n\nAvoid: reference label, before/after, username, logo, watermark, readable text on signs, gibberish text, misspelled nameplate, flat 2D illustration, anime, chibi, plastic toy look, uncanny realistic face, generic face, altered face, changed identity, same face on everyone, changed outfit, missing glasses, missing accessories, extra fingers, distorted hands, extra limbs, floating character, cluttered unreadable composition.",
  },

  'diorama-vietnam': {
    label: "Vietnam diorama",
    blurb: "You on a travel diorama of Vietnam",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Create a 3D travel diorama poster featuring the person (or people) from this photo as a stylized miniature character on a round collectible display base, surrounded by iconic scenery of Vietnam.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, eyebrow shape, nose, lips, smile, expression, hairstyle, hair texture, hair color, body build, and any glasses, facial hair, freckles, or distinguishing marks. Each person must be instantly recognizable.\n\nOUTFIT: Keep each person's actual clothing from the photo, with its colors, patterns, and cut, plus their shoes (inferred if not visible), jewelry, and accessories, detail for detail. Add one small travel prop, such as a camera, folded map, or small travel bag.\n\nPOSE: If the photo shows the full body, keep the original pose. Otherwise, use a natural, relaxed full-body pose consistent with the visible upper body and gesture, with the face toward the camera or gazing toward the lanterns. Extend any unseen parts of the body naturally to match the visible clothing and build.\n\nCHARACTER STYLE: High-end semi-realistic 3D animated character render: softly stylized proportions with a slightly enlarged head, expressive eyes, smooth skin with subtle subsurface glow, hair sculpted in defined clumps, and realistic fabric textures and folds.\n\nDIORAMA: A circular, multi-level miniature diorama on a thick, polished dark wood display base with a carved edge and a brass nameplate on the front engraved \"VIETNAM\" in elegant serif capitals. Around and behind the character, densely detailed miniatures in layered forced perspective: a Hoi An street of yellow-walled shophouses strung with colorful glowing silk lanterns, an arched covered wooden bridge, Ha Long Bay's emerald water with limestone karst islands and a wooden junk boat with red sails, Saigon's red-brick twin-spired cathedral, a one-pillar lotus pagoda, and green rice terraces stepping down one side of the base. Props: a vintage motorbike loaded with flowers, a cyclo pedicab, a street-food cart with a tiny steaming bowl of pho, a phin coffee filter on a small glass beside a low plastic stool, conical non la hats, lotus flowers in a small pond, tropical palms and bougainvillea. Palette: lantern red, saffron yellow, jade green, lotus pink, and warm sunset gold.\n\nLIGHTING & BACKDROP: Warm, cinematic golden-hour lighting with soft glows from the lanterns, gentle rim light on the character, rich shadows, and shallow depth of field. A softly blurred, warm-toned backdrop. Ultra-detailed miniature photography look, tilt-shift realism.\n\nMULTIPLE PEOPLE: If there are multiple people, place each one on the same base as their own character, keeping their relative positions and interaction from the photo.\n\nTEXT: The only text is the engraved nameplate. Lanterns, signs, and banners use decorative patterns instead of readable writing.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no usernames, no logos, no borders, no watermarks.\n\nAvoid: reference label, before/after, username, logo, watermark, readable text on signs, gibberish text, misspelled nameplate, flat 2D illustration, anime, chibi, plastic toy look, uncanny realistic face, generic face, altered face, changed identity, same face on everyone, changed outfit, missing glasses, missing accessories, extra fingers, distorted hands, extra limbs, floating character, cluttered unreadable composition.",
  },

  'pixel-16bit': {
    label: "16-bit pixel art",
    blurb: "Your photo as a classic SNES-era game screen",
    needs: [],
    buildPrompt: () =>
      "Transform the provided image into clean, high-quality 16-bit pixel art in the style of classic SNES-era games, while strictly preserving the original composition, framing, subjects, and overall silhouettes.\n\nIDENTITY: Preserve every person's recognizable identity in pixel form: face shape, skin tone, eye color, eyebrows, expression, hairstyle, hair color, facial hair, glasses, and distinguishing features. Keep their clothing, its colors and patterns, and accessories. Faces get the most careful pixel placement so each person is instantly recognizable.\n\nCORE STYLE RULES:\n- Convert all forms into pixel-perfect geometry aligned to a strict, uniform grid, at an effective resolution of roughly 128 pixels across the width, scaled up with hard square pixels\n- Keep the pixel size consistent across the entire image, with no mixed resolutions\n- Use a limited, cohesive color palette of about 32 colors, inspired by classic 16-bit games\n- Hard edges only: no blur, no gradients, no anti-aliasing, no smoothing\n\nSHADING & LIGHTING:\n- Simplify lighting into flat shading with 2-3 tones per surface\n- Prioritize readability over realism\n- Remove complex lighting, reflections, and gradients, keeping only the main light direction\n\nDETAIL REDUCTION:\n- Preserve key identifying features and recognizable shapes\n- Eliminate micro-details, textures, and noise\n- Avoid dithering unless absolutely necessary, and keep it minimal\n\nRENDERING CONSTRAINTS:\n- No noise, compression artifacts, painterly effects, or oversharpening halos\n- No HDR-style processing\n- Keep edges crisp and intentional at the pixel level\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal care, keeping their relative positions and interaction.\n\nFINAL GOAL: The result should look like an authentic screenshot from a classic 16-bit game: clean, readable, and visually balanced.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no text, no logos, no borders, no watermarks.\n\nAvoid: blur, gradients, anti-aliasing, smoothing, mixed pixel sizes, low-res 8-bit blob, tiny unreadable faces, heavy dithering, noise, compression artifacts, painterly, oversharpened halos, HDR, 3D render, photorealism, altered identity, changed hairstyle, missing glasses, missing facial hair, game UI, text, logo, watermark.",
  },

  'cozy-farm': {
    label: "Cozy pixel farm",
    blurb: "You on a golden-hour 16-bit harvest farm",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a scene from a cozy 16-bit pixel-art farming life-simulation game, with the person (or people) from the photo as the player character standing on their farm.\n\nIDENTITY: Preserve each person's recognizable identity in pixel form: skin tone, face shape, hairstyle, hair texture, hair color, facial hair, glasses, eyebrows, and expression (a smile stays a warm smile). Keep their adult age and maturity, never childlike. Keep their actual clothing, its colors and patterns, plus accessories, translated into pixel art. Each person must be instantly recognizable.\n\nCHARACTER SPRITE: A charming, softly stylized 16-bit pixel sprite with a slightly enlarged head and adult body proportions (about 3 to 3.5 heads tall), simple expressive eyes, and a clear, readable face, rendered large in the foreground, with crisp square pixels and no smoothing. A relaxed, friendly pose based on their original pose.\n\nSCENE: A harvest-season farm at golden hour, with low, warm light across tilled soil rows stretching from the foreground into a mid-distance wooden farmhouse with glowing amber windows behind a low wooden fence. A field of golden wheat sways in the background. Plump orange pumpkin sprites sit on soil tiles, sunflowers line a dirt path running from the bottom left toward the farmhouse entrance, a small chicken pecks inside a fenced pen, and a cat sits on a fence post with its tail curled, watching.\n\nSKY & STYLE: The sky fades from warm peach at the horizon through gold to pale powder blue overhead, with soft, deliberate color banding in a classic 16-bit dither style. A warm, limited, cozy palette with careful pixel placement, soft shading, and a nostalgic, peaceful mood.\n\nMULTIPLE PEOPLE: If there are multiple people, each one is their own sprite standing together on the farm, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no text, no logos, no borders, no watermarks.\n\nAvoid: childlike, child proportions, younger-looking, baby face, changed outfit, generic farmer outfit, changed hairstyle, changed hair color, missing glasses, missing facial hair, altered identity, existing video game character, tiny unreadable sprite, smooth digital painting, blurry pixels, anti-aliasing, 3D render, photorealism, anime, game UI, inventory bar, clock, text, logo, watermark.",
  },

  'pixel-knight': {
    label: "8-bit knight",
    blurb: "Victorious armored hero on a sunny castle rampart",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a scene from a bright, colorful 8-bit retro action-platformer, with the person (or people) from the photo as a heroic armored knight.\n\nIDENTITY: Preserve each person's recognizable identity in pixel form: skin tone, face shape, eyebrows, expression (a smile stays a smile), facial hair, glasses, and hair color, which shows at the sides of the helmet. The face must be fully visible inside an open-faced helmet. Each person must be instantly recognizable.\n\nCHARACTER SPRITE: A tall, heroic 8-bit sprite at roughly 48x48 pixels, scaled up with hard square pixels, rendered large in the foreground. Full plate armor of original design in cobalt blue with bright gold trim, rounded shoulder pauldrons, and an open-faced helmet with a simple gold crest. Holding a classic knight's sword triumphantly raised overhead, in a confident victory pose with a big grin. Hard black pixel outlines on every element and a limited 8-bit palette.\n\nSCENE: A sunlit castle rampart bursting with color and retro energy: a bright cobalt sky with a big pixel sun, stone-brick battlements in chunky pixel blocks, distant castle-tower silhouettes, gold coin sprites scattered across the platform, and an open treasure chest spilling loot. Two defeated cartoon enemy knights in green lie in a comic heap in the background, limbs at exaggerated angles, with little stars spinning above their heads in classic cartoon-KO style. A checkpoint flag flutters at the edge of the platform.\n\nSTYLE: Faithful 8-bit console aesthetic: a limited, saturated palette, flat colors, crisp pixel geometry, and joyful, triumphant energy.\n\nMULTIPLE PEOPLE: If there are multiple people, each one is their own armored hero sprite in a different armor color (blue, crimson, emerald, violet), standing together in victory poses and keeping their relative positions.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no text, no logos, no borders, no watermarks.\n\nAvoid: existing video game character, horned helmet, shovel, closed visor, hidden face, tiny unreadable sprite, missing beard, missing glasses, altered identity, generic face, gore, blood, smooth digital painting, blurry pixels, anti-aliasing, 16-bit detail, 3D render, photorealism, game UI, score counter, health bar, text, logo, watermark.",
  },

  'voxel-world': {
    label: "Block world",
    blurb: "Your scene rebuilt from cubes, you as a blocky avatar",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a scene from a blocky voxel sandbox video game, with every person rebuilt as a blocky voxel game character.\n\nIDENTITY: Preserve each person's recognizable identity in blocky form: skin tone, eye color, hairstyle and hair color, beard or facial hair, eyebrows, glasses, and their expression (smile, grin, neutral). Recreate their actual clothing, its colors, patterns, and layers (jacket, shirt stripes, dress, tie, jeans), plus accessories, as pixel textures. Each person must be instantly recognizable from their colors, hair, facial hair, and outfit.\n\nCHARACTER MODEL:\n- A classic blocky player-character model: a large cubic head, rectangular torso, rectangular arms, and rectangular legs, with sharp 90-degree edges\n- Face, hair, and clothing painted as flat, crisp pixel-art textures on each cube face, at a low-resolution 64x64 skin-texture scale, with visible individual square pixels and no smoothing\n- Hair and beards as pixel blocks wrapping around the head cube; glasses as pixel frames on the face\n- Pose: a simple, stiff, blocky stance that approximates the original pose (arms can swing or raise as solid blocks)\n\nSCENE: Rebuild the original setting from the photo entirely out of cube blocks in the same voxel style: walls, floors, furniture, tables, trees, and landmarks all become textured blocks (wood planks, stone, cobblestone, grass, glass, wool, and so on) in matching colors. Add a few torches mounted on walls casting warm, hard-edged square light. Bright, clear blue sky with flat, rectangular, blocky clouds if outdoors.\n\nRENDERING: An in-game screenshot look, with pixelated block textures, crisp edges, simple directional lighting, slight ambient occlusion at block corners, and a third-person game camera at roughly the original camera angle.\n\nMULTIPLE PEOPLE: If there are multiple people, each one becomes their own blocky character, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no hotbar, no health bar, no crosshair, no text, no logos, no borders, no watermarks.\n\nAvoid: realistic human, smooth 3D character, rounded shapes, high-resolution textures, LEGO, plush, anime, cartoon, generic default character, same character for everyone, changed outfit, missing beard, missing glasses, wrong hair color, curved surfaces, game UI, hotbar, health hearts, crosshair, text, logo, watermark.",
  },

  'pixel-fantasy': {
    label: "Neon pixel fantasy",
    blurb: "Moody high-res pixel art among alien ruins at dusk",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a painterly high-resolution pixel art scene in the style of an atmospheric indie action-adventure game.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, expression, hairstyle, hair color, facial hair, glasses, and any distinguishing marks. Keep their original expression. Keep their actual clothing, its colors and layers, and accessories, translated into pixel art. Keep their pose; if only the upper body is visible, extend it naturally to a full figure consistent with the visible clothing. Each person must be instantly recognizable.\n\nPIXEL ART STYLE:\n- High-resolution pixel art with crisp, visible square pixels and painterly pixel clusters (not low-res 8-bit), with careful detail on faces, hair, glasses, and clothing folds\n- Limited, moody neon palette: deep violet, magenta, teal, cyan, crimson, and dusky purple, with bright glowing accents\n- Strong rim light in cyan or magenta on the figure's edges, and soft pixel glows from light sources\n- Subtle glitch artifacts: thin horizontal scan-line tears near the frame edges, faint flickers of bright magenta, and a gentle digital corruption feel over the whole composition\n\nSCENE: Reimagine the original setting as a mysterious fantasy pixel-art world at dusk, keeping its basic layout: buildings become crumbling ancient monoliths and ruins, trees become overgrown crimson vines and alien foliage, and the sky becomes a bruised violet and blood-red dusk with stars and a distant moon. Add small pixel fire sprites glowing in the distance, and a reflective pool or wet ground mirroring the sky if there is open ground.\n\nMULTIPLE PEOPLE: If there are multiple people, render each one with equal detail, keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no text, no logos, no borders, no watermarks.\n\nAvoid: smooth digital painting, photorealism, 3D render, low-res 8-bit sprite, blurry pixels, anti-aliased mush, anime, existing video game character, character costume cosplay, changed outfit, changed expression, stern expression when smiling in photo, altered face, changed identity, generic face, missing glasses, missing facial hair, game UI, health bar, text, logo, watermark, extra fingers, distorted hands.",
  },

  'pixel-climb': {
    label: "Pixel mountain climb",
    blurb: "Mid-dash between icy cliffs in a pixel platformer",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a scene from a precise, emotionally evocative 2D pixel-art platformer game, with the person (or people) from the photo as the player character mid-jump.\n\nIDENTITY: Preserve each person's recognizable identity in pixel form: skin tone, hairstyle, hair length, hair color, facial hair, glasses, and their expression (a big smile becomes a pixel grin). Keep their actual clothing, its main colors and patterns, and key accessories (necklaces, earrings, hats), simplified into pixel art. Each person must be instantly recognizable from their hair, colors, outfit, and expression.\n\nCHARACTER SPRITE:\n- A crisp, clean pixel-art sprite at roughly 32x48 pixels, scaled up with hard square pixels and no smoothing, large enough for readable facial features\n- Slightly chibi proportions with a big head and small body\n- A dynamic dash pose: leaping diagonally upward and to the right, one fist forward, hair streaming behind\n- A short magenta-pink pixel dash trail streaking behind the character to show motion\n\nSCENE: A mountain summit climb at high altitude: jagged cliff faces in cold blue-white pixel geometry, a ledge of pale stone in the lower left that the character just launched from, and a sheer icy cliff wall on the right. Layered background depth: the nearest cliffs in sharp pale blue-white, a second layer of soft gray mountain silhouettes, and distant peaks in near-white haze. A single small glowing collectible (a pixel heart) floats in the upper part of the frame, catching a pixel highlight. Snowflakes drift diagonally as individual white pixels across all layers.\n\nSTYLE: A clean, limited palette with careful, deliberate pixel placement, crisp hard edges, and a calm, wintry, slightly melancholic but hopeful mood. Vertical composition implying an ongoing climb.\n\nMULTIPLE PEOPLE: If there are multiple people, each one is their own sprite, dashing together in formation and keeping their relative positions.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no game UI, no text, no logos, no borders, no watermarks.\n\nAvoid: existing video game character, red hair unless in photo, changed hair color, changed outfit, changed expression, generic sprite, tiny unreadable sprite, smooth digital painting, blurry pixels, anti-aliasing, 3D render, photorealism, anime, high-detail illustration, game UI, score counter, text, logo, watermark.",
  },

  'stat-screen': {
    label: "Character stat screen",
    blurb: "You on a glowing green retro RPG profile screen",
    needs: [],
    buildPrompt: () =>
      "Transform this photo into a retro-futuristic handheld computer screen displaying a pixel-art \"character profile\" of the person (or people) from the photo, as if from an old-school RPG.\n\nDEVICE: The frame is a rugged retro-futuristic handheld terminal viewed head-on: a chunky brushed gunmetal and olive-drab metal casing with rivets, worn edges, a small row of toggle switches and one round dial along the bottom bezel, and the word \"PROFILE\" stamped in worn stencil lettering across the top bezel.\n\nSCREEN: A glowing monochrome green CRT display filling most of the frame, with full CRT authenticity: horizontal scanlines, phosphor glow, slight bloom, gentle edge curvature, a soft vignette, and faint flicker texture.\n\nCHARACTER: On the left side of the screen, the person rendered as a simple, charming monochrome green line-art and pixel cartoon portrait from the waist up, keeping their real face shape, hairstyle, hair texture, facial hair, glasses, expression, and clothing silhouette so they are instantly recognizable. Pose based on their original pose, or a friendly wave.\n\nSTATS (lower left): Three short stat rows in blocky green pixel font with bars: \"DANCE MOVES\" (bar half full), \"LOVE\" (bar maxed out), and \"CAKE\" (bar full). Bottom status strip: \"HP 100/100\", \"LVL 99\", and a full \"XP\" bar.\n\nINVENTORY (right panel): A bordered panel titled \"INVENTORY\", listing three or four items actually visible in the photo (clothing, accessories, or objects the person has), each with \"x1\", in short two-word names.\n\nMULTIPLE PEOPLE: If there are multiple people, show each one as a separate character portrait side by side on the screen, and list items from all of them in the inventory.\n\nTEXT: Keep all text short, blocky, legible, and correctly spelled. No other text.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no logos, no brand names, no watermarks.\n\nAvoid: existing video game interface, franchise mascot, yellow device casing, thumbs-up mascot pose, brand names, soda brand, logo, trademark, full color screen, smooth modern UI, misspelled text, gibberish text, long text, altered identity, generic cartoon face, missing glasses, missing facial hair, watermark.",
  },

  'kart-race': {
    label: "Cartoon kart race",
    blurb: "Real you racing a go-kart through a toy world",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "A photorealistic candid action photo of the person (or people) from the uploaded reference photo, riding a go-kart on a bright, glossy, cartoon-style 3D race track, laughing mid-race.\n\nIDENTITY: Use the uploaded photo as the highest-priority facial reference. Preserve each person's exact identity, face shape, hairstyle, hair color, skin tone, eye color, facial features, facial hair, and glasses, so they are instantly recognizable. Do not generate a generic face and do not beautify. Keep their actual clothing and colors. They stay fully photorealistic, with real skin, hair, and fabric, while the karts and the world are stylized.\n\nTHE MIX: The person is a real human photographed in a stylized 3D cartoon world: the go-kart and everything around it have a glossy, saturated, toy-like animated look, with smooth plastic surfaces, rounded shapes, and bright colors. Light the person with the same bright, sunny daylight and matching color bounce so they blend naturally into the scene.\n\nKART: A chunky, rounded, original cartoon go-kart in a bright color drawn from the person's outfit, with oversized tires, a shiny body, and a small racing number on the front.\n\nTRACK & WORLD: A colorful winding race track with candy-striped curbs and checkered flags, bouncy rainbow boost pads glowing on the asphalt, floating glowing star-shaped pickups hovering above the track, rolling bright-green cartoon hills, puffy clouds in a vivid blue sky, and a blurred cheering grandstand in the distance.\n\nCAMERA: A dynamic low-angle action shot from slightly ahead of the kart, slight motion blur on the background and wheels, and sharp focus on the face. Joyful, high-energy, mid-race moment.\n\nMULTIPLE PEOPLE: If there are multiple people, each one drives their own kart side by side, racing neck and neck and laughing together.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no watermarks.\n\nAvoid: existing video game character, franchise mascot, plumber in red cap, question mark blocks, item boxes, green warp pipes, banana peels, turtle shells, branded karts, logo, generic face, beautified face, altered identity, cartoon-rendered person, 3D-rendered person, changed hairstyle, missing glasses, invented rival racers, text, watermark.",
  },

  'hero-wizard': {
    label: "Movie Hero: Wizard",
    blurb: "Robed wizard at a twilight castle academy",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Using the uploaded photo as the identity reference, transform the person (or people) into a highly realistic wizard in an epic fantasy film, preserving their exact facial features, hairstyle, skin tone, eye color, facial structure, facial hair, glasses, and overall likeness, with zero beautification or facial reinterpretation.\n\nCOSTUME: Dress them in elegant, original wizarding-academy robes: a long, heavy, hooded black wool robe with a deep jewel-tone silk lining (emerald, sapphire, burgundy, or gold, chosen to complement the person's coloring), fine embroidered trim, and an ornate clasp at the collar. The collar, neckline, or tie of their own outfit from the photo is visible underneath. A carved wooden wand in hand. Keep their own jewelry and glasses.\n\nSCENE: They walk confidently along the stone terrace of a vast, ancient gothic castle academy at twilight, surrounded by towering spires, pointed stone arches, ivy-covered walls, and windows glowing with warm golden candlelight. Glowing lanterns line the path, enchanted mist drifts low over the stones, faint glowing magical particles float in the air, and a single owl glides across the dusky sky.\n\nLIGHTING & QUALITY: Warm golden light from the castle windows contrasting with cool blue evening tones, cinematic rim lighting on the face and hood, shallow depth of field, ultra-realistic photography with highly detailed fabric and stone textures, and blockbuster fantasy-film quality, with immersive, epic storytelling composition.\n\nMULTIPLE PEOPLE: If there are multiple people, each one wears their own robe with a different lining color, walking together and keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no house crests, no school emblems, no watermarks.\n\nAvoid: franchise costume, house crest, school emblem, striped house scarf, lightning bolt scar, round wire glasses unless in photo, floating candles, existing film character, altered face, beautified face, changed identity, generic face, changed hairstyle, missing glasses, missing facial hair, cartoon, illustration, 3D render, text, logo, watermark.",
  },

  'hero-ranger': {
    label: "Movie Hero: Ranger",
    blurb: "Hooded fantasy ranger in an ancient forest",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Using the uploaded photo as the identity reference, transform the person (or people) into a highly realistic heroic ranger in an epic high-fantasy film, preserving their exact facial features, hairstyle, skin tone, eye color, facial structure, facial hair, glasses, and overall likeness, with zero beautification or facial reinterpretation.\n\nCOSTUME: Original, realistic medieval ranger attire: a weathered, hooded, forest-green wool cloak fastened with a simple leaf-shaped clasp, layered brown leather armor and a quilted gambeson, leather bracers, a crossbody leather strap with travel pouches, rugged worn boots, and a carved wooden walking staff or longbow. Fabric and leather are realistically worn, with mud, scuffs, and frayed edges. Keep their own jewelry and glasses.\n\nSCENE: They walk through an ancient, enchanted forest of enormous gnarled trees draped in thick moss, past crumbling moss-covered stone ruins and old stone pathways, with magical shafts of sunlight piercing the canopy through drifting mist, floating dust and pollen motes, and a cold breath visible in the air. Breathtaking, untouched wilderness with a sense of ancient history.\n\nLIGHTING & QUALITY: Soft golden sunlight rays cutting through cool green-gray fog, cinematic rim light on the face and hood, shallow depth of field, ultra-realistic photography with highly detailed leather, wool, moss, and stone textures, and blockbuster fantasy-film quality, with immersive, epic storytelling composition.\n\nMULTIPLE PEOPLE: If there are multiple people, each one is a member of the same ranger fellowship, with variations in cloak color (forest green, slate gray, deep brown, midnight blue), walking together and keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no watermarks.\n\nAvoid: existing film character, franchise costume, elven ears, pointed ears, altered face, beautified face, changed identity, generic face, changed hairstyle, missing glasses, missing facial hair, clean new costume, modern clothing visible, plastic armor, cartoon, illustration, 3D render, text, logo, watermark.",
  },

  'hero-space': {
    label: "Movie Hero: Space adventurer",
    blurb: "Galactic hero in a neon starship city",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Using the uploaded photo as the identity reference, transform the person (or people) into a highly realistic hero in an epic space-adventure film, preserving their exact facial features, hairstyle, skin tone, eye color, facial structure, facial hair, glasses, and overall likeness, with zero beautification or facial reinterpretation.\n\nCOSTUME: Original, lived-in galactic adventurer attire: a weathered brown leather flight jacket with utility straps, a layered wrap-collar tunic in a neutral tone, a wide utility belt with pouches, fitted cargo trousers, and scuffed boots, with a small handheld communicator or holo-map device in hand. The collar, neckline, or colors of their own outfit from the photo carry into the costume. Fabric and leather are realistically worn and dusty. Keep their own jewelry and glasses.\n\nSCENE: They walk confidently through a futuristic planet city at dusk: towering sleek skyscrapers, elevated maglev rail bridges, hovering vehicles and small starships gliding between buildings, and glowing neon signs and holographic billboards with unreadable alien script. Warm amber streetlights mix with cool cyan and magenta neon.\n\nLIGHTING & QUALITY: Dramatic cinematic lighting with a pastel dusk sky, neon reflections and rim light on the face, atmospheric haze and depth, shallow depth of field, ultra-realistic photography with highly detailed textures, and blockbuster sci-fi film quality with professional visual effects and immersive world-building.\n\nMULTIPLE PEOPLE: If there are multiple people, each one is a member of the same starship crew, with variations in jacket color and gear, walking together and keeping their relative positions and interaction from the photo.\n\nOUTPUT: A single full-frame image only. No inset, no picture-in-picture, no thumbnail of the original, no readable text, no logos, no watermarks.\n\nAvoid: existing film character, franchise costume, laser sword, glowing energy sword, monk robes, white armored soldiers, small green wise alien, existing alien species, crowd of people, readable signs, logo, brand names, altered face, beautified face, changed identity, generic face, changed hairstyle, missing glasses, missing facial hair, clean new costume, cartoon, illustration, 3D render, text, watermark.",
  },

  'hero-team': {
    label: "Movie Hero: Superhero team",
    blurb: "Everyone in the photo as an original superhero team",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Vertical cinematic superhero team poster starring the person (or people) from the uploaded photo as original superheroes.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person in the photo: face shape, skin tone, eye color, facial features, expression, hairstyle, hair color, facial hair, glasses, tattoos, and body build, with zero beautification or facial reinterpretation. Faces stay fully visible, with no masks or helmets covering them.\n\nTHE TEAM:\n- Every person in the photo becomes a member of the team, each with their own original superhero suit: sleek, realistic tactical armor and fabric in a unique color scheme drawn from that person's actual outfit colors, with distinct but simple original emblems (abstract shapes, not letters or existing symbols)\n- The team is exactly the people in the photo: add no other heroes or figures\n- They pose together in a confident, relaxed heroic stance in a layered, symmetrical team-poster composition, keeping their relative positions from the photo\n\nSCENE: A city rooftop at golden hour after saving the day, with the skyline glowing behind them, a few colorful confetti bursts and streamers drifting through the air, and the team relaxed and celebrating together.\n\nLIGHTING & QUALITY: Warm golden-hour light, strong rim light on suits and armor, realistic shadows, high contrast, and vivid suit colors. Medium-wide shot at eye level, cinematic depth, ultra-detailed realistic costumes with fabric and metal textures, sharp face details, subtle film grain, and blockbuster movie-poster realism.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no titles, no logos, no watermarks.\n\nAvoid: existing superhero, comic book character, franchise costume, famous emblem, star shield, celebrity likeness, actor likeness, recognizable real person, giant green hulking figure, extra heroes, invented teammates, masks covering faces, helmets on main subjects, altered face, beautified face, changed identity, generic face, missing glasses, missing facial hair, injured people, blood, gore, text, title, logo, watermark, cartoon, illustration.",
  },

  'horror-cinema': {
    label: "Horror movie night",
    blurb: "Deadpan popcorn while creepy figures watch behind you",
    needs: [],
    tier: 'full',
    buildPrompt: () =>
      "Vertical cinematic horror movie poster: the person (or people) from the uploaded photo sitting in a dark movie theater, calmly eating popcorn while sinister figures fill the rows behind them.\n\nIDENTITY: Preserve the exact facial identity and likeness of every person from the reference image: face shape, skin tone, eye color, facial features, hairstyle, hair color, facial hair, glasses, tattoos, and body build, with zero beautification or facial reinterpretation. Keep their actual clothing, its colors, and accessories.\n\nSUBJECT: Centered, frontal composition. The person sits alone in a red velvet cinema seat in the front row, holding a large red-and-white striped popcorn bucket on their lap, one hand raised near the mouth eating popcorn, with a calm, intense, deadpan stare straight into the camera.\n\nTHE AUDIENCE: The rows behind them are filled with silent, unsettling figures of original design, staring at the screen: pale porcelain masks with blank eyes, cracked antique doll faces, a figure in a burlap sack hood, a tall shadowy figure in a hooded cloak, and a gaunt figure in a vintage carnival mask. They are softer in focus than the subject, and every figure is an original creation, not any existing horror movie character.\n\nSCENE & LIGHTING: A dark cinema auditorium with rows of red velvet seats and a single bright, circular projector light glowing at the top center behind the audience, casting a strong beam through drifting volumetric haze, with soft lens flare. Deep shadows, high contrast, and subtle rim light outlining the subject's face, hair, shoulders, and popcorn bucket. Rich red seats against a desaturated dark background.\n\nQUALITY: Symmetrical framing, shallow depth of field with the subject in razor-sharp focus, realistic skin texture, film grain, suspenseful movie-poster mood, and ultra-realistic photography.\n\nMULTIPLE PEOPLE: If there are multiple people, they sit side by side in the front row sharing the popcorn, all with the same deadpan stare.\n\nOUTPUT: A single full-frame portrait-orientation image only. No inset, no picture-in-picture, no thumbnail of the original, no text, no logos, no watermarks.\n\nAvoid: existing horror movie character, famous horror villain, hockey mask, screaming ghost mask, killer clown with red hair, white featureless slasher mask, franchise costume, celebrity likeness, blood, gore, weapons, knives, altered face, beautified face, changed identity, missing glasses, missing facial hair, cartoon, illustration, 3D render, text, logo, watermark.",
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
export function presetSummaries(event, hidden = [], chosen = {}) {
  const subject = subjectFor(event);
  return Object.entries(PRESETS)
    .filter(([id]) => !hidden.includes(id))
    .map(([id, p]) => ({
    id,
    label: resolve(p.label, subject),
    blurb: resolve(p.blurb, subject),
    cost: costFor(id, chosen),
    tier: tierFor(id, chosen),
    defaultTier: defaultTier(id),
    lockedCost: p.lockedCost || null,
    needsReferences: p.needs.includes('references'),
    needsBackdrops: p.needs.includes('backdrop'),
    previewable: p.needs.length === 0,
  }));
}

// What the guest page is allowed to see about the presets.
export function publicPresets(event, fallbackPreviews = {}, hidden = []) {
  const enabled = (event.aiPresets || DEFAULT_ENABLED).filter((id) => !hidden.includes(id));
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
export function maxCostFor(event, chosen = {}) {
  const enabled = event.aiPresets || DEFAULT_ENABLED;
  const locked = event.lockCouple === true;
  const costs = enabled
    .filter((id) => PRESETS[id])
    .map((id) => {
      const p = PRESETS[id];
      if (locked && p.lockedCost) return p.lockedCost;
      return costFor(id, chosen);
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

// --- Editable prompts ----------------------------------------------------
// The admin can rewrite any preset's prompt from the Style library. An
// override is stored as a template with placeholders, filled in per event:
//   {subject}        who the event is for ("the couple", "Mai")
//   {keepsake_text}  the keepsake frame text
export const PROMPT_PLACEHOLDERS = ['{subject}', '{keepsake_text}'];

export function defaultPromptTemplate(id) {
  const p = PRESETS[id];
  if (!p) return '';
  return p.buildPrompt({ subject: '{subject}', keepsakeText: '{keepsake_text}', referenceCount: 0 });
}

// The prompt to send for an edit. `overrides` is the admin's saved set.
export function promptFor(id, { subject, keepsakeText }, overrides = {}) {
  const override = overrides && Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : null;
  if (override) {
    return override
      .split('{subject}').join(subject)
      .split('{keepsake_text}').join(keepsakeText);
  }
  return PRESETS[id].buildPrompt({ subject, keepsakeText, referenceCount: 0 });
}

// Short fingerprint of the prompt a sample was made with, so the library can
// tell when a sample is out of date.
export function promptFingerprint(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// --- Which model each style runs on --------------------------------------
// Edits that draw people into a photo need the strongest model, so they
// start on Full; every look (filters, art styles, eras) starts on Lite.
// The admin can switch any style in the Style library; `chosen` is that
// saved map of { presetId: 'full' | 'lite' }.
export function defaultTier(id) {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return 'full';
  if (isTier(PRESETS[id].tier)) return PRESETS[id].tier;
  return PRESETS[id].needs.length > 0 ? 'full' : 'lite';
}

export function tierFor(id, chosen = {}) {
  const t = chosen && Object.prototype.hasOwnProperty.call(chosen, id) ? chosen[id] : null;
  return isTier(t) ? t : defaultTier(id);
}

export function costFor(id, chosen = {}) {
  return MODELS[tierFor(id, chosen)].cost;
}
