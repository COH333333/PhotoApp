// Forget the connected Google account. Photos keep going to the album;
// they just stop being copied to Drive until an account is connected again.
import { isAdminRequest } from '../../../../lib/auth';
import { clearGoogleTokens } from '../../../../lib/store';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'POST') return res.status(405).end();
  await clearGoogleTokens();
  res.status(200).json({ ok: true });
}
