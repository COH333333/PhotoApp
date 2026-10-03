// App-wide style samples. One photo, rendered in every style once, shown to
// guests at every event as the preview for that style. Host-only.
//
//   POST multipart { photo }      set the sample photo (clears old renders)
//   POST json { presetId }        render one style from the sample
//   DELETE                        remove the photo and every render
import { put, del } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { isAdminRequest } from '../../../lib/auth';
import { getGlobalSamples, setGlobalSamples, getPromptOverrides } from '../../../lib/store';
import { parseMultipart } from '../../../lib/parseForm';
import { PRESETS, promptFor, promptFingerprint, defaultPromptTemplate } from '../../../lib/presets';
import { runEdit, isAiConfigured } from '../../../lib/fal';

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
  const urls = [samples.sampleUrl, ...Object.values(samples.previews || {})].filter(Boolean);
  await Promise.all(urls.map((u) => del(u).catch(() => {})));
}

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const samples = await getGlobalSamples();

  if (req.method === 'GET') return res.status(200).json(samples);

  if (req.method === 'DELETE') {
    await removeAll(samples);
    await setGlobalSamples({ sampleUrl: null, previews: {} });
    return res.status(200).json({ sampleUrl: null, previews: {} });
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
    const next = { sampleUrl: blob.url, previews: {}, madeWith: {} };
    await setGlobalSamples(next);
    return res.status(201).json(next);
  }

  if (!isAiConfigured()) return res.status(503).json({ error: 'AI is not set up yet.' });
  const { presetId } = await readJson(req);
  const preset = PRESETS[presetId];
  if (!preset || preset.needs.length !== 0) return res.status(400).json({ error: 'That preset has no preview.' });
  if (!samples.sampleUrl) return res.status(400).json({ error: 'Upload a sample photo first.' });

  try {
    const overrides = await getPromptOverrides();
    const prompt = promptFor(presetId, { subject: 'the couple', keepsakeText: 'Sample Event · Jan 1, 2026' }, overrides);
    const result = await runEdit({ prompt, imageUrls: [samples.sampleUrl], model: preset.model });
    const blob = await put(`samples/${presetId}-${nanoid(6)}.jpg`, await fetchBuffer(result.url), {
      access: 'public',
      contentType: 'image/jpeg',
    });
    const previews = { ...(samples.previews || {}) };
    if (previews[presetId]) await del(previews[presetId]).catch(() => {});
    previews[presetId] = blob.url;
    // Remember which prompt made this sample, so an edited prompt shows as
    // out of date in the library.
    const template = overrides[presetId] || defaultPromptTemplate(presetId);
    const madeWith = { ...(samples.madeWith || {}), [presetId]: promptFingerprint(template) };
    const next = { ...samples, previews, madeWith };
    await setGlobalSamples(next);
    return res.status(200).json(next);
  } catch (err) {
    console.error(`Global sample failed (${presetId}):`, err?.body || err?.message || err);
    return res.status(502).json({ error: `Couldn't make the ${preset.label} sample. Try again.` });
  }
}
