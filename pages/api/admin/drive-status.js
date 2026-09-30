import { isAdminRequest } from '../../../lib/auth';
import { isDriveConnected } from '../../../lib/drive';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const connected = await isDriveConnected();
  res.status(200).json({ connected });
}
