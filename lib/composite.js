// Keeping the couple's photo genuinely untouched in "Pose with us".
//
// Asking the model nicely to leave the couple alone mostly works, but every
// pixel it regenerates of them is a chance for a face to drift. This does it
// structurally instead:
//
//   1. Before the edit, pad the couple's portrait with empty space on one side
//      and tell the model to put the guests there. It doesn't need to reframe
//      or make room, because the room already exists.
//   2. After the edit, paste the original portrait back over its exact
//      rectangle. The couple's pixels are then the original's, not the
//      model's, with a short feathered blend so the seam doesn't show.
//
// Everything runs at one working width so the model's output and the original
// line up exactly; the model is asked for a 2K result so the strip it draws
// isn't visibly softer than the pasted-back original.
import sharp from 'sharp';

// How much empty space to add. Sized off the taller dimension as well as the
// width: a wedding portrait is usually portrait-orientation, and a pad based on
// width alone leaves a tall thin strip that a group of three can't stand in.
// When they don't fit they spill over the couple, and the paste-back then cuts
// the overlapping guest in half at the seam.
const PAD_OF_WIDTH = 0.5;
const PAD_OF_HEIGHT = 0.5;

// Keep the padded image small enough to send and for the model to handle.
const MAX_TOTAL_WIDTH = 2400;

// How far the paste-back fades out at the seam, as a fraction of the width.
export const FEATHER_FRACTION = 0.025;

// Width of the couple's portion in the working image.
const BASE_WIDTH = 1200;

// Pads the portrait and returns everything restoreOriginal needs to undo it.
export async function padForGuests(buffer) {
  const upright = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(upright).metadata();

  const width = BASE_WIDTH;
  const height = Math.max(1, Math.round((meta.height / meta.width) * BASE_WIDTH));
  const origin = await sharp(upright).resize(width, height).jpeg({ quality: 94 }).toBuffer();

  // Fill the new space with the average colour of the portrait's trailing
  // edge, so it reads as more of the same room rather than a white box.
  const stripW = Math.max(1, Math.round(width * 0.06));
  const [r, g, b] = await sharp(origin)
    .extract({ left: width - stripW, top: 0, width: stripW, height })
    .resize(1, 1)
    .raw()
    .toBuffer();

  const pad = Math.min(
    Math.round(Math.max(width * PAD_OF_WIDTH, height * PAD_OF_HEIGHT)),
    MAX_TOTAL_WIDTH - width
  );
  const padded = await sharp(origin)
    .extend({ right: pad, background: { r, g, b } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return { padded, origin, width, height, totalWidth: width + pad };
}

// Composites the untouched original back over the model's output.
export async function restoreOriginal({ editedBuffer, origin, width, height, totalWidth }) {
  // The model rarely returns exactly the size it was given, and `aspect_ratio:
  // auto` snaps to its own buckets, so the shape can come back different too.
  // `fill` would stretch the guests while the pasted-back couple stayed
  // undistorted, which is glaring at the seam. Cover anchored top-left keeps
  // the geometry honest and crops the surplus instead.
  const edited = await sharp(editedBuffer)
    .resize(totalWidth, height, { fit: 'cover', position: 'left top' })
    .toBuffer();

  const feather = Math.max(2, Math.round(width * FEATHER_FRACTION));
  const stop = ((width - feather) / width).toFixed(4);
  const ramp = Buffer.from(
    `<svg width="${width}" height="${height}">` +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">' +
      `<stop offset="${stop}" stop-color="#fff" stop-opacity="1"/>` +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
      '</svg>'
  );

  const maskedOriginal = await sharp(origin)
    .ensureAlpha()
    .composite([{ input: ramp, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(edited)
    .composite([{ input: maskedOriginal, left: 0, top: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
