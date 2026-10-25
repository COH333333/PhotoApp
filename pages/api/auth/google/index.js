import { isAdminRequest } from '../../../../lib/auth';
import { getAuthUrl, isDriveConfigured } from '../../../../lib/drive';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (!isDriveConfigured()) return res.redirect('/admin/setup?error=not_configured');
  res.redirect(getAuthUrl());
}
