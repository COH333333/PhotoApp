// The app's main Google Drive folder. Host-only.
//   GET               { name, url }
//   POST { name }     rename it (creating it first if needed)
import { isAdminRequest } from '../../../lib/auth';
import { ensureRootFolder, renameRootFolder } from '../../../lib/drive';
import { driveReady } from '../../../lib/driveArchive';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (!(await driveReady())) return res.status(400).json({ error: 'Connect Google Drive first.' });
  try {
    if (req.method === 'GET') {
      const root = await ensureRootFolder();
      return res.status(200).json({ name: root.name, url: root.url });
    }
    if (req.method === 'POST') {
      const name = String(req.body?.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
      if (!name) return res.status(400).json({ error: 'Give the folder a name.' });
      const root = await renameRootFolder(name);
      return res.status(200).json({ name: root.name, url: root.url });
    }
  } catch (err) {
    console.error('Drive root folder failed:', err.message);
    return res.status(502).json({ error: `Google Drive said: ${err.message}` });
  }
  res.status(405).end();
}
