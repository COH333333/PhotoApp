import { clearAdminCookie } from '../../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', clearAdminCookie());
  res.status(200).json({ ok: true });
}
