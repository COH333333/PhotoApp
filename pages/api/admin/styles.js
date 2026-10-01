// Remove a style from the app, or bring it back. Host-only.
//   POST { id, hidden: true|false }
import { isAdminRequest } from '../../../lib/auth';
import { getHiddenPresets, setHiddenPresets } from '../../../lib/store';
import { PRESETS } from '../../../lib/presets';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  const { id, hidden } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return res.status(400).json({ error: 'Unknown style' });
  const current = await getHiddenPresets();
  const next = hidden ? Array.from(new Set([...current, id])) : current.filter((x) => x !== id);
  await setHiddenPresets(next);
  return res.status(200).json({ hidden: next });
}
