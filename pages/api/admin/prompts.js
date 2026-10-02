// Edit a style's prompt, or reset it to the built-in one. Host-only.
//   POST { id, text }   text empty or null = back to default
import { isAdminRequest } from '../../../lib/auth';
import { getPromptOverrides, setPromptOverrides } from '../../../lib/store';
import { PRESETS, defaultPromptTemplate } from '../../../lib/presets';

const MAX_LENGTH = 4000;

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  const { id, text } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return res.status(400).json({ error: 'Unknown style' });

  const overrides = await getPromptOverrides();
  const clean = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';
  if (clean.length > MAX_LENGTH) return res.status(400).json({ error: `Keep prompts under ${MAX_LENGTH} characters.` });

  // Saving text identical to the built-in prompt is the same as resetting.
  if (!clean || clean === defaultPromptTemplate(id).trim()) {
    delete overrides[id];
  } else {
    overrides[id] = clean;
  }
  await setPromptOverrides(overrides);
  return res.status(200).json({ overrides });
}
