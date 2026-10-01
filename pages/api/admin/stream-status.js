// Tells the host whether the Cloudflare Stream connection works, and if
// not, what Cloudflare said. Host-only.
import { isAdminRequest } from '../../../lib/auth';
import { isStreamConfigured, checkStream } from '../../../lib/stream';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (!isStreamConfigured()) return res.status(200).json({ configured: false });
  try {
    const info = await checkStream();
    return res.status(200).json({ configured: true, ok: true, ...info });
  } catch (err) {
    return res.status(200).json({ configured: true, ok: false, error: err.message, status: err.status || null });
  }
}
