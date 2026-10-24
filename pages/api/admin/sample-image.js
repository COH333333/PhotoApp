// Serves one style sample (or the source photo) from our own origin, so the
// Style library can zip them all in the browser. Host-only.
import { isAdminRequest } from '../../../lib/auth';
import { getGlobalSamples } from '../../../lib/store';
import { withVersions } from '../../../lib/samples';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { id, tier } = req.query;
  const samples = withVersions(await getGlobalSamples());
  const url = id === 'source'
    ? samples.sampleUrl
    : (tier && samples.versions?.[String(tier)]?.[String(id)]?.url) || samples.previews?.[String(id)];
  if (!url) return res.status(404).json({ error: 'No such sample' });

  const upstream = await fetch(url);
  if (!upstream.ok) return res.status(502).json({ error: 'Could not load the sample' });
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
}
