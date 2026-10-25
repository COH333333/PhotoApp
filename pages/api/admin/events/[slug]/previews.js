// Sample images for the style presets, so guests can see what a style
// looks like before spending an edit on it. Made once per event from a
// photo the host picks (a portrait by default), stored alongside the event.
//
// Event previews are made on the Lite model unless the host switches a
// style to Full here. That choice only affects this preview; what guests'
// own edits use is still set per style in the Style library.
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

export const DEFAULT_PREVIEW_TIER = 'lite';

function cleanTier(t) {
  return t === 'full' || t === 'lite' ? t : null;
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
  const madeWith = { ...(event.stylePreviewTiers || {}) };
  const choices = { ...(event.previewModels || {}) };

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (previews[id]) {
      await del(previews[id]).catch(() => {});
      delete previews[id];
      delete madeWith[id];
      await updateEvent(slug, { stylePreviews: previews, stylePreviewTiers: madeWith });
    }
    return res.status(200).json({ stylePreviews: previews, stylePreviewTiers: madeWith });
  }

  // Remember which model this event's preview of a style should use.
  if (req.method === 'PATCH') {
    const { presetId, tier } = req.body || {};
    const t = cleanTier(tier);
    if (!previewable(presetId) || !t) return res.status(400).json({ error: 'Pick a style and Lite or Full.' });
    if (t === DEFAULT_PREVIEW_TIER) delete choices[presetId];
    else choices[presetId] = t;
    await updateEvent(slug, { previewModels: choices });
    return res.status(200).json({ previewModels: choices });
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (!isAiConfigured()) return res.status(503).json({ error: 'AI is not set up yet.' });

  const { presetId, tier: askedTier } = req.body || {};
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
    const tier = cleanTier(askedTier) || choices[presetId] || DEFAULT_PREVIEW_TIER;
    const result = await runEdit({ prompt, imageUrls: [sampleUrl], tier });
    const blob = await put(`previews/${slug}/${presetId}-${nanoid(6)}.jpg`, await fetchBuffer(result.url), {
      access: 'public',
      contentType: 'image/jpeg',
    });
    if (previews[presetId]) await del(previews[presetId]).catch(() => {});
    previews[presetId] = blob.url;
    madeWith[presetId] = tier;
    await updateEvent(slug, { stylePreviews: previews, stylePreviewTiers: madeWith });
    return res.status(200).json({ stylePreviews: previews, stylePreviewTiers: madeWith, presetId, url: blob.url, tier });
  } catch (err) {
    console.error(`Preview failed (${slug}/${presetId}):`, err?.body || err?.message || err);
    return res.status(502).json({ error: `Couldn't make the ${PRESETS[presetId].label} preview. Try again.` });
  }
}
