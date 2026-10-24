// Choose which AI model a style runs on. Host-only.
//   POST { id, tier }            one style
//   POST { ids: [...], tier }    several at once
// tier: 'full' | 'lite'
import { isAdminRequest } from '../../../lib/auth';
import { getPresetModels, setPresetModels } from '../../../lib/store';
import { PRESETS, tierFor } from '../../../lib/presets';
import { isTier } from '../../../lib/models';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  const { id, ids, tier } = req.body || {};
  if (!isTier(tier)) return res.status(400).json({ error: 'Unknown model' });
  const list = (Array.isArray(ids) ? ids : [id]).filter((x) => Object.prototype.hasOwnProperty.call(PRESETS, x));
  if (!list.length) return res.status(400).json({ error: 'Unknown style' });

  const chosen = await getPresetModels();
  for (const x of list) chosen[x] = tier;
  await setPresetModels(chosen);
  const tiers = Object.fromEntries(Object.keys(PRESETS).map((x) => [x, tierFor(x, chosen)]));
  return res.status(200).json({ tiers });
}
