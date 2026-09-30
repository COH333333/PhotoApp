import { nanoid } from 'nanoid';
import { getEvent, reserveAiEdit, releaseAiEdit, saveEdit, getAiUsage } from '../../../../lib/store';
import { parseMultipart } from '../../../../lib/parseForm';
import { readGuestId } from '../../../../lib/guest';
import {
  PRESETS,
  publicPresets,
  keepsakeTextFor,
} from '../../../../lib/presets';
import { runEdit, isAiConfigured } from '../../../../lib/fal';
import { aiLimitsFor } from '../../../../lib/aiLimits';

export const config = {
  api: { bodyParser: false },
  // AI edits usually take 5–20 seconds; lib/fal.js gives up at 70.
  maxDuration: 90,
};

const MAX_REFERENCES = 6;

function toDataUri(file) {
  return `data:image/jpeg;base64,${file.buffer.toString('base64')}`;
}

function remainingFor(limits, usage) {
  return Math.max(0, Math.min(limits.perGuest - usage.guest, limits.perEvent - usage.total));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (!isAiConfigured()) {
    return res.status(503).json({ error: 'AI edits are not set up for this event yet.' });
  }

  // The guest id cookie is issued when the event page loads. Requiring it here
  // means the per-guest limit can't be skipped by calling the API directly.
  const guestId = readGuestId(req);
  if (!guestId) {
    return res.status(400).json({ error: 'Reload the page and try again.' });
  }

  let fields;
  let files;
  try {
    ({ fields, files } = await parseMultipart(req));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const presetId = fields.preset;
  const allowed = publicPresets(event).map((p) => p.id);
  if (!presetId || !allowed.includes(presetId)) {
    return res.status(400).json({ error: 'That edit is not available for this event.' });
  }
  const preset = PRESETS[presetId];

  const photo = files.photo;
  if (!photo) return res.status(400).json({ error: 'No photo received.' });
  const selfie = files.selfie;
  if (preset.needs.includes('selfie') && !selfie) {
    return res.status(400).json({ error: 'This edit needs a selfie too.' });
  }

  let backdrop = null;
  if (preset.needs.includes('backdrop')) {
    backdrop = (event.backdrops || []).find((b) => b.id === fields.backdropId);
    if (!backdrop) {
      return res.status(400).json({ error: 'Pick which photo to pose with, then try again.' });
    }
  }

  const limits = aiLimitsFor(event);
  const reservation = await reserveAiEdit(slug, guestId, limits);
  if (!reservation.ok) {
    return res.status(429).json({
      error:
        reservation.reason === 'guest'
          ? `You've used all ${limits.perGuest} AI edits for this event. You can still post photos.`
          : 'AI edits are used up for this event. You can still post photos.',
      remaining: 0,
    });
  }

  // From here on, any failure before the AI returns an image gives the edit back.
  let result;
  try {
    // Images go to the AI inline and aren't stored here. A selfie in
    // particular only exists for the length of this request.
    const references = (event.referencePhotos || []).slice(0, MAX_REFERENCES);
    // Image 1 is whatever the model should preserve. For most presets that's
    // the guest's photo. For a backdrop preset it's the couple's portrait, so
    // their faces survive untouched and the guest is the synthesised part.
    const imageUrls = backdrop ? [backdrop.url] : [toDataUri(photo)];
    if (preset.needs.includes('references')) {
      for (const r of references) imageUrls.push(r.url);
    }
    if (preset.needs.includes('selfie')) imageUrls.push(toDataUri(selfie));
    if (backdrop) imageUrls.push(toDataUri(photo));

    const prompt = preset.buildPrompt({
      referenceCount: references.length,
      keepsakeText: keepsakeTextFor(event),
      placement: fields.placement,
    });

    result = await runEdit({ prompt, imageUrls, model: preset.model });
  } catch (err) {
    console.error(`AI edit failed (${slug}/${presetId}):`, err?.body || err?.message || err);
    await releaseAiEdit(slug, guestId).catch((e) => console.error('Release failed:', e.message));
    return res.status(502).json({
      error: "That edit didn't work this time. Try again, or post the original.",
    });
  }

  // The edit succeeded and was paid for, so it counts even if bookkeeping
  // below hiccups. Always hand the guest their result.
  const edit = {
    id: nanoid(14),
    slug,
    guestId,
    preset: presetId,
    label: preset.label,
    resultUrl: result.url,
    createdAt: new Date().toISOString(),
  };
  let remaining;
  try {
    await saveEdit(edit);
    remaining = remainingFor(limits, await getAiUsage(slug, guestId));
  } catch (err) {
    console.error('Saving edit failed:', err.message);
  }

  res.status(200).json({ editId: edit.id, resultUrl: edit.resultUrl, label: edit.label, remaining });
}
