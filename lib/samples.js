// App-wide style samples with a version per AI model.
//
// global:samples = {
//   sampleUrl,                          the source photo
//   versions: { full: { presetId: { url, madeWith } }, lite: { ... } },
//   previews, madeWith, madeWithModel   what guests see: per style, the version
//                                       for the model that style runs on (or the
//                                       other one if that hasn't been made yet)
// }
// Older records only had `previews` (+ madeWith/madeWithModel); withVersions()
// folds those into `versions` so nothing is lost.
import { TIERS } from './models';

export function withVersions(samples) {
  const s = { previews: {}, madeWith: {}, madeWithModel: {}, ...(samples || {}) };
  const versions = Object.fromEntries(TIERS.map((t) => [t, { ...(s.versions?.[t] || {}) }]));
  for (const [id, url] of Object.entries(s.previews || {})) {
    const t = s.madeWithModel?.[id] || 'full';
    if (versions[t] && !versions[t][id]) versions[t][id] = { url, madeWith: s.madeWith?.[id] };
  }
  return { ...s, versions };
}

// Point the guest-facing preview for one style at the right version.
export function syncPreview(samples, id, preferredTier) {
  const order = [preferredTier, ...TIERS.filter((t) => t !== preferredTier)];
  const tier = order.find((t) => samples.versions?.[t]?.[id]);
  const previews = { ...(samples.previews || {}) };
  const madeWith = { ...(samples.madeWith || {}) };
  const madeWithModel = { ...(samples.madeWithModel || {}) };
  if (tier) {
    const v = samples.versions[tier][id];
    previews[id] = v.url;
    if (v.madeWith === undefined) delete madeWith[id];
    else madeWith[id] = v.madeWith;
    madeWithModel[id] = tier;
  } else {
    delete previews[id];
    delete madeWith[id];
    delete madeWithModel[id];
  }
  return { ...samples, previews, madeWith, madeWithModel };
}

export function allSampleUrls(samples) {
  const urls = new Set([samples?.sampleUrl, ...Object.values(samples?.previews || {})]);
  for (const t of Object.values(samples?.versions || {})) for (const v of Object.values(t)) urls.add(v?.url);
  return [...urls].filter(Boolean);
}
