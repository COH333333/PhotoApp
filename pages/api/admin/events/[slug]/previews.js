// Sample images for the style presets, so guests can see what a style
// looks like before spending an edit on it. Made once per event from a
// photo the host picks (a portrait by default), stored alongside the event.
//
// One preset per request: an edit takes 10–20 seconds and the dashboard
// loops through the enabled styles one at a time.
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../../../lib/auth';
import { getEvent, updateEvent, getPromptOverrides } from '../../../../../lib/store';
import { PRESETS, keepsakeTextFor, promptFor } from '../../../../../lib/presets';
import { subjectFor } from '../../../../../lib/templates';
import { runEdit, isAiConfigured } from '../../../../../lib/fal';

export const config = { maxDuration: 90 };

// Only styles that work on a single photo can be previewed; the "add
// someone" presets depend on the guest's own input.
export function previewable(id) {
  return Boolean(PRESETS[id]) && PRESETS[id].needs.length === 0;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch sample (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { slug } = req.query;
  const event = await getEvent(slug);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const previews = { ...(event.stylePreviews || {}) };

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (previews[id]) {
      await del(previews[id]).catch(() => {});
      delete previews[id];
      await updateEvent(slug, { stylePreviews: previews });
    }
    return res.status(200).json({ stylePreviews: previews });
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (!isAiConfigured()) return res.status(503).json({ error: 'AI is not set up yet.' });

  const { presetId } = req.body || {};
  if (!previewable(presetId)) return res.status(400).json({ error: 'That preset has no preview.' });

  // The sample photo: the host's chosen one, else the first portrait, else
  // the first reference photo.
  const sampleUrl =
    event.sampleUrl || event.backdrops?.[0]?.url || event.referencePhotos?.[0]?.url || null;
  if (!sampleUrl) {
    return res.status(400).json({ error: 'Add a portrait to pose with (or a sample photo) first.' });
  }

  try {
    const preset = PRESETS[presetId];
    const prompt = promptFor(presetId, { subject: subjectFor(event), keepsakeText: keepsakeTextFor(event) }, await getPromptOverrides());
    const result = await runEdit({ prompt, imageUrls: [sampleUrl], model: preset.model });
    const blob = await put(`previews/${slug}/${presetId}-${nanoid(6)}.jpg`, await fetchBuffer(result.url), {
      access: 'public',
      contentType: 'image/jpeg',
    });
    if (previews[presetId]) await del(previews[presetId]).catch(() => {});
    previews[presetId] = blob.url;
    await updateEvent(slug, { stylePreviews: previews });
    return res.status(200).json({ stylePreviews: previews, presetId, url: blob.url });
  } catch (err) {
    console.error(`Preview failed (${slug}/${presetId}):`, err?.body || err?.message || err);
    return res.status(502).json({ error: `Couldn't make the ${PRESETS[presetId].label} preview. Try again.` });
  }
}
