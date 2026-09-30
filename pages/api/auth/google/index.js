import { isAdminRequest } from '../../../../lib/auth';
import { getAuthUrl } from '../../../../lib/drive';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  res.redirect(getAuthUrl());
}
