// App-wide style samples. One photo, rendered in every style once, shown to
// guests at every event as the preview for that style. Host-only.
//
//   POST multipart { photo }      set the sample photo (clears old renders)
//   POST json { presetId, tier }  render one style from the sample on that
//                                 model ('full' | 'lite'; default: the style's
//                                 current model). Both versions are kept.
//   DELETE                        remove the photo and every render
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../lib/auth';
import { getGlobalSamples, setGlobalSamples, getPromptOverrides, getPresetModels } from '../../../lib/store';
import { parseMultipart } from '../../../lib/parseForm';
import { PRESETS, promptFor, promptFingerprint, defaultPromptTemplate, tierFor } from '../../../lib/presets';
import { runEdit, isAiConfigured } from '../../../lib/fal';
import { isTier } from '../../../lib/models';
import { withVersions, syncPreview, allSampleUrls } from '../../../lib/samples';

export const config = { api: { bodyParser: false }, maxDuration: 90 };

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch sample (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeAll(samples) {
  await Promise.all(allSampleUrls(samples).map((u) => del(u).catch(() => {})));
}

const EMPTY = { sampleUrl: null, previews: {}, madeWith: {}, madeWithModel: {}, versions: { full: {}, lite: {} } };

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const samples = withVersions(await getGlobalSamples());

  if (req.method === 'GET') return res.status(200).json(samples);

  if (req.method === 'DELETE') {
    await removeAll(samples);
    await setGlobalSamples(EMPTY);
    return res.status(200).json(EMPTY);
  }

  if (req.method !== 'POST') return res.status(405).end();

  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/');
  if (isMultipart) {
    let files;
    try {
      ({ files } = await parseMultipart(req));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const file = files.photo;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    await removeAll(samples);
    const blob = await put(`samples/source-${nanoid(6)}.jpg`, file.buffer, { access: 'public', contentType: 'image/jpeg' });
    const next = { ...EMPTY, sampleUrl: blob.url };
    await setGlobalSamples(next);
    return res.status(201).json(next);
  }

  if (!isAiConfigured()) return res.status(503).json({ error: 'AI is not set up yet.' });
  const { presetId, tier: askedTier } = await readJson(req);
  const preset = PRESETS[presetId];
  if (!preset || preset.needs.length !== 0) return res.status(400).json({ error: 'That preset has no preview.' });
  if (!samples.sampleUrl) return res.status(400).json({ error: 'Upload a sample photo first.' });

  try {
    const overrides = await getPromptOverrides();
    const prompt = promptFor(presetId, { subject: 'the couple', keepsakeText: 'Sample Event · Jan 1, 2026' }, overrides);
    const current = tierFor(presetId, await getPresetModels());
    const tier = isTier(askedTier) ? askedTier : current;
    const result = await runEdit({ prompt, imageUrls: [samples.sampleUrl], tier });
    const blob = await put(`samples/${presetId}-${nanoid(6)}.jpg`, await fetchBuffer(result.url), {
      access: 'public',
      contentType: 'image/jpeg',
    });
    // Replace only this model's version; the other one is kept for comparing.
    const old = samples.versions[tier][presetId];
    if (old?.url) await del(old.url).catch(() => {});
    // Remember which prompt made this sample, so an edited prompt shows as
    // out of date in the library.
    const template = overrides[presetId] || defaultPromptTemplate(presetId);
    const versions = {
      ...samples.versions,
      [tier]: { ...samples.versions[tier], [presetId]: { url: blob.url, madeWith: promptFingerprint(template) } },
    };
    // Guests see the version for the model the style runs on.
    const next = syncPreview({ ...samples, versions }, presetId, current);
    await setGlobalSamples(next);
    return res.status(200).json(next);
  } catch (err) {
    console.error(`Global sample failed (${presetId}):`, err?.body || err?.message || err);
    return res.status(502).json({ error: `Couldn't make the ${preset.label} sample. Try again.` });
  }
}
