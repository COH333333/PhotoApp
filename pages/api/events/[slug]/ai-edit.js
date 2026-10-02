import { nanoid } from 'nanoid';
import { put } from '@vercel/blob';
import { getEvent, reserveAiEdit, releaseAiEdit, saveEdit, getAiUsage, getHiddenPresets, getPromptOverrides } from '../../../../lib/store';
import { parseMultipart } from '../../../../lib/parseForm';
import { readGuestId } from '../../../../lib/guest';
import { requireAccess } from '../../../../lib/access';
import { uploadsOpen } from '../../../../lib/eventState';
import {
  PRESETS,
  publicPresets,
  keepsakeTextFor,
  presetLabel,
  promptFor,
} from '../../../../lib/presets';
import { subjectFor } from '../../../../lib/templates';
import { runEdit, isAiConfigured } from '../../../../lib/fal';
import { aiLimitsFor } from '../../../../lib/aiLimits';
import { padForGuests, restoreOriginal } from '../../../../lib/composite';

// The locked path spends real time after the model returns — downloading the
// result, compositing, uploading — so the generation gets a shorter slice and
// the paste-back is skipped rather than risking the platform killing the
// request. A killed request never runs the catch, so the guest would lose an
// edit credit for an image they never saw.
const ROUTE_BUDGET_MS = 75_000;
const LOCKED_GEN_BUDGET_MS = 50_000;
const PASTE_BACK_RESERVE_MS = 15_000;

export const config = {
  api: { bodyParser: false },
  // AI edits usually take 5–20 seconds; lib/fal.js gives up at 70.
  maxDuration: 90,
};

const MAX_REFERENCES = 6;

function toDataUri(file) {
  return `data:image/jpeg;base64,${file.buffer.toString('base64')}`;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function remainingFor(limits, usage) {
  return Math.max(0, Math.min(limits.perGuest - usage.guest, limits.perEvent - usage.total));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (!requireAccess(req, res, event)) return;
  if (!uploadsOpen(event)) {
    return res.status(403).json({ error: 'Uploads for this event have closed.', closed: true });
  }

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
  const allowed = publicPresets(event, {}, await getHiddenPresets()).map((p) => p.id);
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

  const locked = event.lockCouple === true;
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
  const startedAt = Date.now();
  let result;
  let pasteBackApplied = false;
  try {
    // Images go to the AI inline and aren't stored here. A selfie in
    // particular only exists for the length of this request.
    const references = (event.referencePhotos || []).slice(0, MAX_REFERENCES);
    // Image 1 is whatever the model should preserve. For most presets that's
    // the guest's photo. For a backdrop preset it's the couple's portrait, so
    // their faces survive untouched and the guest is the synthesised part.
    // With locking on, the portrait is padded with empty space for the guests
    // and its own pixels are composited back afterwards, so the couple can't
    // drift at all. `pad` is null when locking is off or doesn't apply.
    let pad = null;
    if (backdrop && locked) {
      pad = await padForGuests(await fetchBuffer(backdrop.url));
    }

    let baseImage;
    if (pad) baseImage = `data:image/jpeg;base64,${pad.padded.toString('base64')}`;
    else if (backdrop) baseImage = backdrop.url;
    else baseImage = toDataUri(photo);

    const imageUrls = [baseImage];
    if (preset.needs.includes('references')) {
      for (const r of references) imageUrls.push(r.url);
    }
    if (preset.needs.includes('selfie')) imageUrls.push(toDataUri(selfie));
    if (backdrop) imageUrls.push(toDataUri(photo));

    // The padded "lock" path keeps its own built-in prompt; everything else
    // uses the admin's edited prompt when there is one.
    const promptArgs = { subject: subjectFor(event), keepsakeText: keepsakeTextFor(event) };
    const prompt =
      pad && preset.buildLockedPrompt
        ? preset.buildLockedPrompt({ ...promptArgs, referenceCount: references.length })
        : promptFor(presetId, promptArgs, await getPromptOverrides());
    if (/NaN|undefined|\[object/.test(prompt)) {
      throw new Error(`Prompt for ${presetId} is malformed`);
    }

    result = await runEdit({
      prompt,
      imageUrls,
      model: preset.model,
      resolution: pad ? preset.lockedResolution : undefined,
      timeoutMs: pad ? LOCKED_GEN_BUDGET_MS : undefined,
    });

    const timeLeft = ROUTE_BUDGET_MS - (Date.now() - startedAt);
    if (pad && timeLeft < PASTE_BACK_RESERVE_MS) {
      console.error(
        `Skipping paste-back for ${slug}: only ${timeLeft}ms left of the route budget.`
      );
    } else if (pad) {
      // Paste the couple's own pixels back over the model's output. If this
      // step fails the model's version is still a perfectly good image, so
      // fall back to it rather than losing the edit the guest paid for.
      try {
        const final = await restoreOriginal({
          editedBuffer: await fetchBuffer(result.url),
          ...pad,
        });
        const blob = await put(`edits/${slug}/${nanoid(12)}.jpg`, final, {
          access: 'public',
          contentType: 'image/jpeg',
        });
        result = { ...result, url: blob.url };
        pasteBackApplied = true;
      } catch (err) {
        console.error('Couple paste-back failed, using the model output:', err.message);
      }
    }
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
    label: presetLabel(presetId, event),
    resultUrl: result.url,
    // True only when the couple's own pixels were composited back. False means
    // the model's version of them is what the guest is looking at.
    coupleLocked: pasteBackApplied,
    // Our own copy, so posting it can clean it up rather than orphaning it.
    tempBlobUrl: pasteBackApplied ? result.url : null,
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
