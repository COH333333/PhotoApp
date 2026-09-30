import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../../lib/auth';
import { getEvent, listPhotos, getAiUsage } from '../../../lib/store';
import { PRESETS, DEFAULT_ENABLED, keepsakeTextFor, maxCostFor, DEFAULT_COST } from '../../../lib/presets';
import { isAiConfigured } from '../../../lib/fal';
import { aiLimitsFor } from '../../../lib/aiLimits';
import { preparePhoto } from '../../../lib/heicConvert';
import QRCodeCard from '../../../components/QRCodeCard';


export async function getServerSideProps({ req, params }) {
  if (!isAdminRequest(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const photos = await listPhotos(params.slug);
  const usage = await getAiUsage(params.slug, null);

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const guestUrl = `${proto}://${req.headers.host}/e/${event.slug}`;

  const allPresets = Object.entries(PRESETS).map(([id, p]) => ({
    id,
    label: p.label,
    blurb: p.blurb,
    needsReferences: p.needs.includes('references'),
  }));

  return {
    props: {
      event,
      photos,
      guestUrl,
      allPresets,
      aiConfigured: isAiConfigured(),
      aiUsed: usage.total,
      limits: aiLimitsFor(event),
      defaultKeepsake: keepsakeTextFor({ ...event, keepsakeText: '' }),
      costPerEdit: maxCostFor(event),
    },
  };
}

export default function AdminEventDetail({
  event,
  photos,
  guestUrl,
  allPresets,
  aiConfigured,
  aiUsed,
  limits,
  defaultKeepsake,
  costPerEdit,
}) {
  const [references, setReferences] = useState(event.referencePhotos || []);
  const [uploading, setUploading] = useState(false);

  const [enabled, setEnabled] = useState(event.aiPresets || DEFAULT_ENABLED);
  const [perGuest, setPerGuest] = useState(limits.perGuest);
  const [perEvent, setPerEvent] = useState(limits.perEvent);
  const [keepsakeText, setKeepsakeText] = useState(event.keepsakeText || '');
  const [saveState, setSaveState] = useState('');

  async function handleReferenceUpload(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      for (const file of picked) {
        const prepared = await preparePhoto(file);
        const form = new FormData();
        form.append('photo', prepared, 'reference.jpg');
        const res = await fetch(`/api/admin/events/${event.slug}/references`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || 'Could not upload that photo.');
          break;
        }
        setReferences(data.event.referencePhotos);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteReference(id) {
    const res = await fetch(`/api/admin/events/${event.slug}/references?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setReferences(data.event.referencePhotos);
    }
  }

  function togglePreset(id) {
    setSaveState('');
    setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function saveAiSettings(e) {
    e.preventDefault();
    setSaveState('Saving…');
    try {
      const res = await fetch(`/api/admin/events/${event.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiPresets: enabled, aiPerGuest: perGuest, aiPerEvent: perEvent, keepsakeText }),
      });
      setSaveState(res.ok ? 'Saved' : 'Could not save. Try again.');
    } catch {
      setSaveState('Could not save. Check your connection.');
    }
  }

  const pendingCount = photos.filter((p) => p.syncStatus !== 'synced').length;
  const aiPhotoCount = photos.filter((p) => p.aiLabel).length;
  const maxCost = (Number(perEvent) || 0) * costPerEdit;

  return (
    <div className="admin-shell page">
      <Head>
        <title>{`${event.name} - Moment Share`}</title>
      </Head>
      <div className="wide-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <Link href="/admin" className="muted" style={{ textDecoration: 'none' }}>
          &larr; All events
        </Link>
        <h1 className="display" style={{ fontSize: 28, marginTop: 8, marginBottom: 32 }}>{event.name}</h1>

        <div className="admin-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <QRCodeCard url={guestUrl} />

            <div className="card">
              <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Couple reference photos</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Used by "Add the couple." Upload 3 to 6 clear photos of you both: faces visible, a mix of
                full-length and closer shots, in the outfits you'll wear. Ordinary photos are fine.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {references.map((r) => (
                  <div key={r.id} style={{ position: 'relative' }}>
                    <img src={r.url} alt="Reference" style={{ height: 72, width: 72, objectFit: 'cover', borderRadius: 3 }} />
                    <button onClick={() => handleDeleteReference(r.id)} aria-label="Remove photo" className="remove-dot">
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {references.length < 6 && (
                <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Add photos'}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={handleReferenceUpload}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <form className="card" onSubmit={saveAiSettings}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 className="display" style={{ fontSize: 18, margin: 0 }}>AI edits</h2>
                <span className="muted">{aiUsed} used so far</span>
              </div>
              {!aiConfigured && (
                <p className="notice-dark">
                  Not active yet: add your FAL_KEY in Vercel's environment variables, then redeploy.
                  Guests can still post photos in the meantime.
                </p>
              )}

              <div style={{ marginTop: 12 }}>
                {allPresets.map((p) => (
                  <label key={p.id} className="check-row">
                    <input type="checkbox" checked={enabled.includes(p.id)} onChange={() => togglePreset(p.id)} />
                    <span>
                      <strong>{p.label}</strong> <span className="muted">{p.blurb}</span>
                      {p.needsReferences && references.length === 0 && enabled.includes(p.id) && (
                        <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                          Hidden from guests until you add reference photos.
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {enabled.includes('keepsake') && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="keepsake">Keepsake frame text</label>
                  <input
                    id="keepsake"
                    value={keepsakeText}
                    maxLength={80}
                    placeholder={defaultKeepsake}
                    onChange={(e) => { setKeepsakeText(e.target.value); setSaveState(''); }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="perGuest">Edits per guest</label>
                  <input id="perGuest" type="number" min="0" max="50" value={perGuest}
                    onChange={(e) => { setPerGuest(e.target.value); setSaveState(''); }} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="perEvent">Edits for the whole event</label>
                  <input id="perEvent" type="number" min="0" max="5000" value={perEvent}
                    onChange={(e) => { setPerEvent(e.target.value); setSaveState(''); }} />
                </div>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Most this event can cost: about ${maxCost.toFixed(2)}, using the priciest edit
                you have switched on at ${costPerEdit.toFixed(2)} each. Simpler edits cost ${DEFAULT_COST.toFixed(2)}.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-primary">Save AI settings</button>
                {saveState && <span className="muted" role="status">{saveState}</span>}
              </div>
            </form>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 className="display" style={{ fontSize: 18, margin: 0 }}>
                  Photos ({photos.length}{aiPhotoCount ? `, ${aiPhotoCount} AI` : ''})
                </h2>
                {pendingCount > 0 && <span className="muted">{pendingCount} not yet in Drive</span>}
              </div>
              {photos.length === 0 ? (
                <div className="card">
                  <p className="muted" style={{ margin: 0 }}>No photos yet. Share the QR code to get started.</p>
                </div>
              ) : (
                <div className="gallery-grid">
                  {photos.map((p) => (
                    <div key={p.id} style={{ position: 'relative' }}>
                      <img src={p.thumbUrl || p.url} alt="" loading="lazy" decoding="async" />
                      {p.aiLabel && <span className="ai-tag">AI · {p.aiLabel}</span>}
                      {p.syncStatus !== 'synced' && (
                        <span className="sync-tag">{p.syncStatus === 'failed' ? 'sync failed' : 'not in Drive'}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
