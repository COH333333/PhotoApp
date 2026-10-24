// Save the drag-and-drop order of styles. Applies to the Style library,
// every event's settings page, and the guest style picker. Host-only.
//   POST { order: [presetId, ...] }   empty array = back to the built-in order
import { isAdminRequest } from '../../../lib/auth';
import { setPresetOrder } from '../../../lib/store';
import { PRESETS } from '../../../lib/presets';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  const order = Array.isArray(req.body?.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'Send an order list.' });
  const known = Array.from(new Set(order.filter((id) => Object.prototype.hasOwnProperty.call(PRESETS, id))));
  await setPresetOrder(known);
  return res.status(200).json({ order: known });
}
