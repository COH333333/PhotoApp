import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../../lib/auth';
import { getEvent, listAllPhotos, getAiUsage } from '../../../lib/store';
// Deliberately NOT importing PRESETS or maxCostFor here: referencing them in
// the rendered component pulls lib/presets into the client bundle, prompts and
// all, and that bundle is fetchable by any guest. Everything this page needs
// about the presets is computed in getServerSideProps and passed as props.
import {
  PRESETS,
  DEFAULT_ENABLED,
  keepsakeTextFor,
  DEFAULT_COST,
  MAX_BACKDROPS,
} from '../../../lib/presets';
import { isAiConfigured } from '../../../lib/fal';
import { aiLimitsFor } from '../../../lib/aiLimits';
import { preparePhoto } from '../../../lib/heicConvert';
import QRCodeCard from '../../../components/QRCodeCard';
import { guestLink, albumLink } from '../../../lib/access';
import { uploadsState } from '../../../lib/eventState';


export async function getServerSideProps({ req, params }) {
  if (!isAdminRequest(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const photos = await listAllPhotos(params.slug);
  const usage = await getAiUsage(params.slug, null);

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers.host}`;
  const guestUrl = guestLink(origin, event);
  const albumUrl = albumLink(origin, event);

  const allPresets = Object.entries(PRESETS).map(([id, p]) => ({
    id,
    label: p.label,
    blurb: p.blurb,
    cost: p.cost || DEFAULT_COST,
    lockedCost: p.lockedCost || null,
    needsReferences: p.needs.includes('references'),
    needsBackdrops: p.needs.includes('backdrop'),
  }));

  return {
    props: {
      event,
      initialPhotos: photos,
      guestUrl,
      albumUrl,
      uploads: uploadsState(event),
      allPresets,
      aiConfigured: isAiConfigured(),
      aiUsed: usage.total,
      limits: aiLimitsFor(event),
      defaultKeepsake: keepsakeTextFor({ ...event, keepsakeText: '' }),
      defaultCost: DEFAULT_COST,
    },
  };
}

export default function AdminEventDetail({
  event,
  initialPhotos,
  guestUrl,
  albumUrl,
  uploads,
  allPresets,
  aiConfigured,
  aiUsed,
  limits,
  defaultKeepsake,
  defaultCost,
}) {
  const [references, setReferences] = useState(event.referencePhotos || []);
  const [backdrops, setBackdrops] = useState(event.backdrops || []);
  const [uploadingBackdrop, setUploadingBackdrop] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [enabled, setEnabled] = useState(event.aiPresets || DEFAULT_ENABLED);
  const [perGuest, setPerGuest] = useState(limits.perGuest);
  const [perEvent, setPerEvent] = useState(limits.perEvent);
  const [keepsakeText, setKeepsakeText] = useState(event.keepsakeText || '');
  const [lockCouple, setLockCouple] = useState(event.lockCouple === true);
  const [saveState, setSaveState] = useState('');

  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date || '');
  const [uploadsMode, setUploadsMode] = useState(uploads.mode);
  const [approvalMode, setApprovalMode] = useState(event.approvalMode === true);
  const [settingsState, setSettingsState] = useState('');

  const [photos, setPhotos] = useState(initialPhotos);
  const [photoFilter, setPhotoFilter] = useState('all');

  async function setStatus(id, status) {
    const res = await fetch(`/api/admin/events/${event.slug}/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function deletePhoto(id) {
    if (!window.confirm('Delete this photo from the album? This cannot be undone.')) return;
    const res = await fetch(`/api/admin/events/${event.slug}/photos/${id}`, { method: 'DELETE' });
    if (res.ok) setPhotos((cur) => cur.filter((p) => p.id !== id));
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsState('Saving…');
    try {
      const res = await fetch(`/api/admin/events/${event.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date, uploadsMode, approvalMode }),
      });
      setSettingsState(res.ok ? 'Saved' : 'Could not save. Try again.');
    } catch {
      setSettingsState('Could not save. Check your connection.');
    }
  }

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

  async function handleBackdropUpload(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setUploadingBackdrop(true);
    try {
      for (const file of picked) {
        const prepared = await preparePhoto(file);
        const form = new FormData();
        form.append('photo', prepared, 'backdrop.jpg');
        const res = await fetch(`/api/admin/events/${event.slug}/backdrops`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || 'Could not upload that photo.');
          break;
        }
        setBackdrops(data.event.backdrops);
      }
    } finally {
      setUploadingBackdrop(false);
    }
  }

  async function handleDeleteBackdrop(id) {
    const res = await fetch(`/api/admin/events/${event.slug}/backdrops?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setBackdrops(data.event.backdrops);
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
        body: JSON.stringify({
          aiPresets: enabled,
          aiPerGuest: perGuest,
          aiPerEvent: perEvent,
          keepsakeText,
          lockCouple,
        }),
      });
      setSaveState(res.ok ? 'Saved' : 'Could not save. Try again.');
    } catch {
      setSaveState('Could not save. Check your connection.');
    }
  }

  const pendingCount = photos.filter((p) => p.syncStatus !== 'synced').length;
  const aiPhotoCount = photos.filter((p) => p.aiLabel).length;
  const awaiting = photos.filter((p) => p.status === 'pending').length;
  const shownPhotos = photos.filter((p) => {
    if (photoFilter === 'pending') return p.status === 'pending';
    if (photoFilter === 'hidden') return p.status === 'hidden';
    return true;
  });
  const poseLockedCost = (allPresets.find((p) => p.id === 'pose-with-us') || {}).lockedCost;
  const liveCost = allPresets
    .filter((p) => enabled.includes(p.id))
    .reduce((max, p) => Math.max(max, lockCouple && p.lockedCost ? p.lockedCost : p.cost), defaultCost);
  const maxCost = (Number(perEvent) || 0) * liveCost;

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
            <QRCodeCard url={guestUrl} albumUrl={albumUrl} />

            <form className="card" onSubmit={saveSettings}>
              <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Event settings</h2>
              <div className="field">
                <label htmlFor="ev-name">Name</label>
                <input id="ev-name" value={name} onChange={(e) => { setName(e.target.value); setSettingsState(''); }} required />
              </div>
              <div className="field">
                <label htmlFor="ev-date">Date</label>
                <input id="ev-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSettingsState(''); }} />
              </div>
              <div className="field">
                <label htmlFor="ev-uploads">Uploads</label>
                <select id="ev-uploads" value={uploadsMode} onChange={(e) => { setUploadsMode(e.target.value); setSettingsState(''); }}>
                  <option value="auto">Close 7 days after the event date</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {uploads.open ? 'Guests can add photos right now.' : 'Uploads are closed; the album stays viewable.'}
                  {uploads.closesAt && uploads.open
                    ? ` Closes ${new Date(uploads.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
                    : ''}
                </span>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={approvalMode} onChange={() => { setApprovalMode((v) => !v); setSettingsState(''); }} />
                <span>
                  <strong>Approve photos before they show</strong>{' '}
                  <span className="muted">New photos wait in your queue below until you approve them.</span>
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button className="btn btn-primary">Save</button>
                {settingsState && <span className="muted" role="status">{settingsState}</span>}
              </div>
            </form>

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

            <div className="card">
              <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Portraits to pose with</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Used by "Pose with us." Guests pick one of these and get added standing beside you.
                Your photo stays exactly as it is, so choose ones you love. Leave some space around
                you in the frame — that's where the guest goes.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {backdrops.map((b) => (
                  <div key={b.id} style={{ position: 'relative' }}>
                    <img
                      src={b.url}
                      alt="Portrait"
                      style={{ height: 96, width: 72, objectFit: 'cover', borderRadius: 3 }}
                    />
                    <button onClick={() => handleDeleteBackdrop(b.id)} aria-label="Remove portrait" className="remove-dot">
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {backdrops.length < MAX_BACKDROPS && (
                <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
                  {uploadingBackdrop ? 'Uploading…' : 'Add portraits'}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={handleBackdropUpload}
                    style={{ display: 'none' }}
                    disabled={uploadingBackdrop}
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
                      {p.needsBackdrops && backdrops.length === 0 && enabled.includes(p.id) && (
                        <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                          Hidden from guests until you add portraits to pose with.
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

              {enabled.includes('pose-with-us') && (
                <label className="check-row" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={lockCouple}
                    onChange={() => { setLockCouple((v) => !v); setSaveState(''); }}
                  />
                  <span>
                    <strong>Add guests in a separate space</strong>{' '}
                    <span className="muted">
                      in "Pose with us." Widens the photo and puts guests in the new area, then
                      lays our original back over its half, so our faces are never redrawn. The
                      cost is how it looks: guests stand in an adjoining space rather than in the
                      scene with us. Off by default, because sharing the scene reads far better.
                      ${poseLockedCost ? poseLockedCost.toFixed(2) : '0.12'} an edit instead of{' '}
                      ${defaultCost.toFixed(2)}.
                    </span>
                  </span>
                </label>
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
                you have switched on at ${liveCost.toFixed(2)} each. Simpler edits cost ${defaultCost.toFixed(2)}.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-primary">Save AI settings</button>
                {saveState && <span className="muted" role="status">{saveState}</span>}
              </div>
            </form>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h2 className="display" style={{ fontSize: 18, margin: 0 }}>
                  Photos ({photos.length}{aiPhotoCount ? `, ${aiPhotoCount} AI` : ''})
                </h2>
                {pendingCount > 0 && <span className="muted">{pendingCount} not yet in Drive</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {[
                  ['all', 'All'],
                  ['pending', `Waiting for approval${awaiting ? ` (${awaiting})` : ''}`],
                  ['hidden', 'Hidden'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn btn-secondary${photoFilter === key ? ' is-active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setPhotoFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shownPhotos.length === 0 ? (
                <div className="card">
                  <p className="muted" style={{ margin: 0 }}>
                    {photos.length === 0 ? 'No photos yet. Share the QR code to get started.' : 'Nothing here.'}
                  </p>
                </div>
              ) : (
                <div className="gallery-grid">
                  {shownPhotos.map((p) => (
                    <div key={p.id} className={`mod-cell${p.status === 'hidden' ? ' is-hidden' : ''}`}>
                      <img src={p.thumbUrl || p.url} alt="" loading="lazy" decoding="async" />
                      {p.aiLabel && <span className="ai-tag">AI · {p.aiLabel}</span>}
                      {p.status === 'pending' && <span className="sync-tag">waiting</span>}
                      {p.status === 'hidden' && <span className="sync-tag">hidden</span>}
                      {p.status !== 'pending' && p.status !== 'hidden' && p.syncStatus !== 'synced' && (
                        <span className="sync-tag">{p.syncStatus === 'failed' ? 'sync failed' : 'not in Drive'}</span>
                      )}
                      <div className="mod-actions">
                        {p.status === 'pending' || p.status === 'hidden' ? (
                          <button onClick={() => setStatus(p.id, 'approved')}>Approve</button>
                        ) : (
                          <button onClick={() => setStatus(p.id, 'hidden')}>Hide</button>
                        )}
                        <button onClick={() => deletePhoto(p.id)}>Delete</button>
                      </div>
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
