// Rename a style (its name and short description), or reset to built-in.
// Host-only.   POST { id, label, blurb }   empty = back to the built-in text
import { isAdminRequest } from '../../../lib/auth';
import { getStyleCustom, setPresetLabels } from '../../../lib/store';
import { PRESETS, MAX_LABEL, MAX_BLURB, defaultLabelTemplate, defaultBlurbTemplate } from '../../../lib/presets';

function clean(text, max) {
  return typeof text === 'string' ? text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return res.status(400).json({ error: 'Unknown style' });

  const label = clean(req.body.label, MAX_LABEL);
  const blurb = clean(req.body.blurb, MAX_BLURB);
  const { labels } = await getStyleCustom();
  const entry = {};
  // Text identical to the built-in is the same as no override.
  if (label && label !== defaultLabelTemplate(id)) entry.label = label;
  if (blurb && blurb !== defaultBlurbTemplate(id)) entry.blurb = blurb;
  if (Object.keys(entry).length) labels[id] = entry;
  else delete labels[id];
  await setPresetLabels(labels);
  return res.status(200).json({ labels });
}
