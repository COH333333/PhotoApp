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
      'Show the people in this photo as they would have looked in a photograph taken around 1985. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly. Reimagine their hair, clothing, accessories, and surroundings with ' +
      'bold, unmistakably mid-1980s styling: expressive silhouettes, statement accessories, ' +
      'layered details, and period colors and textures. Make it feel like a genuine 1985 snapshot ' +
      'with analog grain, faded color, direct flash, and subtle softness, with a small ' +
      'red-orange camera date stamp in the lower right corner. No modern objects. Keep the same ' +
      'number of people and the same poses.',
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
      'Show the people in this photo as they would have looked in a photograph taken around 1925. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair, clothing, and surroundings with unmistakable 1920s Jazz Age style: ' +
      'beaded and fringed drop-waist dresses, finger waves and bobs, pinstripe suits, bow ties and ' +
      'pocket squares, long pearl necklaces, and an Art Deco ballroom with geometric gold detail. ' +
      'Make it feel like a genuine period photograph: warm sepia tone, soft focus, gentle ' +
      'vignetting, and fine silver grain. ' +
      'No modern objects and no text.',
  },

  fifties: {
    label: '1950s',
    blurb: 'Saturated slide-film colour, full skirts',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a color photograph taken around 1956. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair, clothing, and surroundings with unmistakable 1950s style: full ' +
      'circle skirts, cardigans, polka dots, pin curls, slicked-back hair, crisp short-sleeve ' +
      'shirts, and a sunny suburban backyard or chrome diner with a rounded vintage car nearby. ' +
      'Make it feel like a genuine 1950s slide-film photograph with rich saturated reds and ' +
      'teals, bright daylight, and fine grain. ' +
      'No modern objects and no text.',
  },

  seventies: {
    label: '1970s',
    blurb: 'Wide collars, warm faded film',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a photograph taken around 1976. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair, clothing, and surroundings with unmistakable 1970s style: wide ' +
      'collars, flared trousers, earth-tone patterns, suede and corduroy, feathered and voluminous ' +
      'hair, tinted aviator glasses, and a wood-paneled living room or sunny outdoor gathering. ' +
      'Make it feel like a genuine 1970s snapshot with warm orange and brown tones, faded color, ' +
      'soft focus, and heavy grain. ' +
      'No modern objects and no text.',
  },

  nineties: {
    label: '1990s',
    blurb: 'Disposable-camera flash and a date stamp',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a photograph taken around 1996. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair, clothing, and accessories with unmistakable mid-1990s style: denim ' +
      'jackets, oversized blazers, slip dresses, flannel, scrunchies, butterfly clips, and ' +
      'chunky sneakers. Make it feel like a genuine disposable-camera snapshot from 1996: harsh ' +
      'direct flash, slightly blown highlights, warm color shift, visible grain, and a small ' +
      'orange camera date stamp in the lower right corner. ' +
      'No modern objects and no other text.',
  },

  y2k: {
    label: 'Y2K',
    blurb: 'Early-digital camera, metallics and shine',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a photo taken around the year 2002. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair, clothing, and accessories with unmistakable Y2K style: metallic and ' +
      'satin fabrics, low-rise denim, tinted rimless sunglasses, frosted lip gloss, spiky or ' +
      'flipped hair, chunky belts, and an early flip phone in someone\'s hand. Make it feel like ' +
      'a genuine early digital-camera photo: on-camera flash, slightly oversaturated color, ' +
      'soft low-resolution detail, and a small digital timestamp in the lower right corner. ' +
      'No other text.',
  },

  victorian: {
    label: 'Victorian portrait',
    blurb: '1890s studio cabinet card',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a formal studio portrait taken around 1890. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their clothing and hair in Victorian style: high-collared dresses with lace and ' +
      'puffed sleeves, pinned-up hair, frock coats, waistcoats, and pocket-watch chains, posed ' +
      'formally in a photographer\'s studio with a painted backdrop and a carved chair. Make it ' +
      'feel like a genuine cabinet card: rich sepia tone, soft edges, gentle fading, and fine ' +
      'surface wear. ' +
      'No modern objects and no text.',
  },

  'saigon-1960s': {
    label: 'Saigon 1960s',
    blurb: 'Áo dài, scooters, faded film colour',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they would have looked in a photograph taken in Saigon around 1965. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their hair and clothing in elegant 1960s Saigon style: graceful áo dài in soft ' +
      'pastel and floral silk, beehive and bouffant hair, cat-eye sunglasses, tailored short-' +
      'sleeve shirts and slim trousers, and a vintage motor scooter nearby, on a tree-lined ' +
      'boulevard with colonial-era buildings and old shop signs. Make it feel like a genuine ' +
      '1960s color photograph with faded warm tones, soft contrast, and fine grain. ' +
      'No modern objects and no readable text.',
  },

  'royal-court': {
    label: 'Royal court',
    blurb: 'Huế imperial court dress',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo dressed for the imperial court of Huế in Vietnam. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their clothing in traditional Nguyễn dynasty court style: richly embroidered ' +
      'áo nhật bình and áo tấc in deep red, gold, and royal blue silk with phoenix and cloud ' +
      'motifs, khăn vấn headwraps, and jade and gold jewelry, standing in a palace courtyard ' +
      'with red lacquered columns and golden roof ornaments. Make it a refined, warmly lit ' +
      'photograph with rich detail. ' +
      'No text.',
  },

  'red-carpet': {
    label: 'Red carpet',
    blurb: 'Black-tie at a film premiere',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo arriving at a glamorous film premiere. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Dress them in black-tie: elegant gowns and tuxedos, styled hair, and fine jewelry, ' +
      'standing on a red carpet in front of a plain dark backdrop, lit by the bright flash of ' +
      'press photographers with a few flashes visible in the background. Make it look like a ' +
      'real red-carpet press photo. ' +
      'No logos and no text.',
  },

  'hoi-an': {
    label: 'Postcard from Hội An',
    blurb: 'Lantern-lit old-town streets',
    needs: [],
    buildPrompt: () =>
      'Move the people in this photo to the old town of Hội An at dusk. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Keep their clothing as it is. Place them on a lantern-lit street of yellow-walled ' +
      'merchant houses with wooden shutters, strings of colorful silk lanterns glowing overhead, ' +
      'bougainvillea on the walls, and the river softly reflecting lights behind them. Match ' +
      'the warm lantern light on the people so they belong in the scene. Make it look like a ' +
      'real travel photograph. ' +
      'No readable signs or text.',
  },

  'year-2085': {
    label: 'The year 2085',
    blurb: 'A gentle, optimistic future',
    needs: [],
    buildPrompt: () =>
      'Show the people in this photo as they might look in a photograph taken in the year 2085. ' +
      'Preserve each person\'s identity, facial features, skin tone, age, and recognizable ' +
      'appearance exactly, and keep the same number of people in the same poses. ' +
      'Reimagine their clothing and surroundings in a gentle, optimistic future: soft-tech ' +
      'fabrics with subtle luminous seams, elegant minimal silhouettes, and a lush garden city ' +
      'with flowing architecture, greenery on every terrace, and soft daylight. Keep it calm ' +
      'and beautiful rather than dark or dystopian, and make it look like a real photograph. ' +
      'No text.',
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
export function presetSummaries(event, hidden = []) {
  const subject = subjectFor(event);
  return Object.entries(PRESETS)
    .filter(([id]) => !hidden.includes(id))
    .map(([id, p]) => ({
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
