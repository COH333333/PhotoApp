import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../../lib/auth';
import { getEvent, listAllPhotos, getAiUsage } from '../../../lib/store';
// Deliberately NOT importing PRESETS or maxCostFor here: referencing them in
// the rendered component pulls lib/presets into the client bundle, prompts and
// all, and that bundle is fetchable by any guest. Everything this page needs
// about the presets is computed in getServerSideProps and passed as props.
import {
  presetSummaries,
  DEFAULT_ENABLED,
  keepsakeTextFor,
  DEFAULT_COST,
  MAX_BACKDROPS,
} from '../../../lib/presets';
import { templateOptions, subjectFor } from '../../../lib/templates';
import { isAiConfigured } from '../../../lib/fal';
import { aiLimitsFor, videoLimitsFor } from '../../../lib/aiLimits';
import { isStreamConfigured, MAX_VIDEO_SECONDS } from '../../../lib/stream';
import { preparePhoto } from '../../../lib/heicConvert';
import QRCodeCard from '../../../components/QRCodeCard';
import { guestLink, albumLink, wallLink } from '../../../lib/access';
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
  const wallUrl = wallLink(origin, event);

  const allPresets = presetSummaries(event);

  return {
    props: {
      event,
      initialPhotos: photos,
      guestUrl,
      albumUrl,
      wallUrl,
      uploads: uploadsState(event),
      allPresets,
      templates: templateOptions(),
      subject: subjectFor(event),
      aiConfigured: isAiConfigured(),
      videoConfigured: isStreamConfigured(),
      videoLimits: videoLimitsFor(event),
      maxVideoSeconds: MAX_VIDEO_SECONDS,
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
  wallUrl,
  uploads,
  allPresets,
  templates,
  subject,
  aiConfigured,
  videoConfigured,
  videoLimits,
  maxVideoSeconds,
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
  const [videosEnabled, setVideosEnabled] = useState(event.videosEnabled !== false);
  const [type, setType] = useState(event.type || 'wedding');
  const [subjectText, setSubjectText] = useState(event.subject || subject);
  const [welcome, setWelcome] = useState(event.welcome || '');
  const [hashtag, setHashtag] = useState(event.hashtag || '');
  const [primaryColor, setPrimaryColor] = useState(event.primaryColor || '#1f6f63');
  const [accentColor, setAccentColor] = useState(event.accentColor || '#e2a73b');
  const [coverUrl, setCoverUrl] = useState(event.coverUrl || null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [settingsState, setSettingsState] = useState('');
  const [previews, setPreviews] = useState(event.stylePreviews || {});
  const [previewBusy, setPreviewBusy] = useState(null); // preset id being made
  const [previewLog, setPreviewLog] = useState('');

  async function makePreview(id) {
    setPreviewBusy(id);
    try {
      const res = await fetch(`/api/admin/events/${event.slug}/previews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewLog(data.error || 'Could not make that preview.');
        return false;
      }
      setPreviews(data.stylePreviews);
      return true;
    } catch {
      setPreviewLog('Connection dropped. Try again.');
      return false;
    } finally {
      setPreviewBusy(null);
    }
  }

  async function makeMissingPreviews() {
    setPreviewLog('');
    const todo = allPresets.filter((p) => p.previewable && enabled.includes(p.id) && !previews[p.id]);
    for (const p of todo) {
      setPreviewLog(`Making ${p.label}…`);
      if (!(await makePreview(p.id))) return;
    }
    setPreviewLog(todo.length ? 'Done.' : 'All enabled styles already have previews.');
  }

  async function removePreview(id) {
    const res = await fetch(`/api/admin/events/${event.slug}/previews?id=${id}`, { method: 'DELETE' });
    if (res.ok) setPreviews((await res.json()).stylePreviews);
  }

  const [streamStatus, setStreamStatus] = useState(null);
  useEffect(() => {
    if (!videoConfigured) return;
    fetch('/api/admin/stream-status')
      .then((r) => r.json())
      .then(setStreamStatus)
      .catch(() => setStreamStatus({ ok: false, error: 'Could not reach the status check' }));
  }, [videoConfigured]);
  const [challengeText, setChallengeText] = useState((event.challenges || []).map((c) => c.text).join('\n'));

  // One challenge per line. Lines that match an existing challenge keep its
  // id, so photos already tagged with it stay attached.
  function challengesFromText() {
    const existing = event.challenges || [];
    return challengeText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ id: existing.find((c) => c.text === text)?.id, text }));
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    try {
      const prepared = await preparePhoto(file);
      const form = new FormData();
      form.append('photo', prepared, 'cover.jpg');
      const res = await fetch(`/api/admin/events/${event.slug}/cover`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || 'Could not upload that photo.');
      else setCoverUrl(data.event.coverUrl);
    } finally {
      setUploadingCover(false);
    }
  }

  async function removeCover() {
    const res = await fetch(`/api/admin/events/${event.slug}/cover`, { method: 'DELETE' });
    if (res.ok) setCoverUrl(null);
  }

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
        body: JSON.stringify({
          name, date, uploadsMode, approvalMode, type, subject: subjectText, welcome, hashtag, primaryColor, accentColor,
          challenges: challengesFromText(),
          videosEnabled,
        }),
      });
      setSettingsState(res.ok ? 'Saved. Reload to see updated edit names.' : 'Could not save. Try again.');
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

  const pendingCount = photos.filter((p) => p.kind !== 'video' && p.syncStatus !== 'synced').length;
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
            <QRCodeCard url={guestUrl} albumUrl={albumUrl} signageHref={`/admin/events/${event.slug}/signage`} wallUrl={wallUrl} />

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
                <label htmlFor="ev-type">Type of event</label>
                <select id="ev-type" value={type} onChange={(e) => { setType(e.target.value); setSettingsState(''); }}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ev-subject">Who the event is for</label>
                <input
                  id="ev-subject"
                  value={subjectText}
                  maxLength={60}
                  placeholder="the couple"
                  onChange={(e) => { setSubjectText(e.target.value); setSettingsState(''); }}
                />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Used in the edit names and the AI instructions: "Pose with {subjectText || subject}",
                  "Add {subjectText || subject}". A name works too: "Mai" or "Grandma Lan".
                </span>
              </div>
              <div className="field">
                <label htmlFor="ev-welcome">Welcome line</label>
                <textarea
                  id="ev-welcome"
                  rows={2}
                  value={welcome}
                  maxLength={240}
                  onChange={(e) => { setWelcome(e.target.value); setSettingsState(''); }}
                />
              </div>
              <div className="field">
                <label htmlFor="ev-hashtag">Hashtag</label>
                <input
                  id="ev-hashtag"
                  value={hashtag}
                  maxLength={40}
                  placeholder="#WendyAndTrung"
                  onChange={(e) => { setHashtag(e.target.value); setSettingsState(''); }}
                />
                <span className="muted" style={{ fontSize: 12.5 }}>Printed on the Post and Story share sizes.</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="ev-primary">Main colour</label>
                  <input id="ev-primary" type="color" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); setSettingsState(''); }} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="ev-accent">Accent colour</label>
                  <input id="ev-accent" type="color" value={accentColor} onChange={(e) => { setAccentColor(e.target.value); setSettingsState(''); }} />
                </div>
              </div>
              <div className="field">
                <label>Cover photo</label>
                {coverUrl && (
                  <img src={coverUrl} alt="Cover" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 3 }} />
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', flex: 1, textAlign: 'center' }}>
                    {uploadingCover ? 'Uploading…' : coverUrl ? 'Replace' : 'Add a cover photo'}
                    <input type="file" accept="image/*,.heic,.heif" onChange={handleCoverUpload} style={{ display: 'none' }} disabled={uploadingCover} />
                  </label>
                  {coverUrl && (
                    <button type="button" className="btn btn-secondary" onClick={removeCover}>Remove</button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>Shown at the top of the guest pages and on the live wall.</span>
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
              <div className="field">
                <label htmlFor="ev-challenges">Photo challenges</label>
                <textarea
                  id="ev-challenges"
                  rows={6}
                  value={challengeText}
                  onChange={(e) => { setChallengeText(e.target.value); setSettingsState(''); }}
                  placeholder={'A photo with the couple\nYour table, all together'}
                />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  One per line, up to 20. Guests tap a challenge before taking a photo; the album can be
                  filtered by them. Leave empty to turn challenges off.
                </span>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={videosEnabled} onChange={() => { setVideosEnabled((v) => !v); setSettingsState(''); }} />
                <span>
                  <strong>Allow video clips</strong>{' '}
                  <span className="muted">
                    Up to {maxVideoSeconds} seconds each, {videoLimits.perGuest} per guest.
                    {videoConfigured ? '' : ' Not active yet: add CF_ACCOUNT_ID and CF_STREAM_TOKEN in Vercel.'}
                  </span>
                  {streamStatus && streamStatus.ok && (
                    <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                      Cloudflare Stream connected{typeof streamStatus.videoCount === 'number' ? ` · ${streamStatus.videoCount} clips stored` : ''}.
                    </span>
                  )}
                  {streamStatus && streamStatus.ok === false && (
                    <span style={{ display: 'block', fontSize: 12.5, color: '#e2a73b' }}>
                      Cloudflare Stream isn't responding: {streamStatus.error}{streamStatus.status ? ` (HTTP ${streamStatus.status})` : ''}.
                    </span>
                  )}
                </span>
              </label>
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
              <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Reference photos of {subject}</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Used by "Add {subject}." Upload 3 to 6 clear photos: faces visible, a mix of
                full-length and closer shots, in the outfits for the day. Ordinary photos are fine.
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
                Used by "Pose with {subject}." Guests pick one of these and get added standing
                beside {subject}. The photo stays exactly as it is, so choose ones you love. Leave
                some space in the frame — that's where the guest goes.
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
                      in "Pose with {subject}." Widens the photo and puts guests in the new area, then
                      lays the original back over its half, so faces are never redrawn. The
                      cost is how it looks: guests stand in an adjoining space rather than in the
                      scene. Off by default, because sharing the scene reads far better.
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

            <div className="card">
              <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Style previews</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Optional. Guests already see the app-wide <Link href="/admin/samples" style={{ color: 'inherit' }}>style samples</Link>;
                make these only if you want the samples to show {subject} instead. One edit per style
                ({`$${defaultCost.toFixed(2)}`}), made from your first portrait to pose with. Save the AI settings
                first so the list matches what guests see.
              </p>
              {backdrops.length === 0 && references.length === 0 && (
                <p className="notice-dark">Add a portrait to pose with first; that's the photo the samples are made from.</p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {allPresets.filter((p) => p.previewable && enabled.includes(p.id)).map((p) => (
                  <div key={p.id} style={{ width: 96, textAlign: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      {previews[p.id] ? (
                        <img src={previews[p.id]} alt={p.label} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 3 }} />
                      ) : (
                        <button
                          className="btn btn-secondary"
                          style={{ width: 96, height: 96, padding: 0, fontSize: 12 }}
                          disabled={previewBusy !== null}
                          onClick={() => { setPreviewLog(''); makePreview(p.id); }}
                        >
                          {previewBusy === p.id ? 'Making…' : 'Make'}
                        </button>
                      )}
                      {previews[p.id] && (
                        <button onClick={() => removePreview(p.id)} aria-label="Remove preview" className="remove-dot">×</button>
                      )}
                    </div>
                    <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>{p.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" disabled={previewBusy !== null || !aiConfigured} onClick={makeMissingPreviews}>
                  Make previews for enabled styles
                </button>
                {previewLog && <span className="muted" role="status">{previewLog}</span>}
              </div>
            </div>

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
                      {p.kind === 'video' && <span className="video-badge">▶ video</span>}
                      {p.status === 'pending' && <span className="sync-tag">waiting</span>}
                      {p.status === 'hidden' && <span className="sync-tag">hidden</span>}
                      {p.status !== 'pending' && p.status !== 'hidden' && p.kind !== 'video' && p.syncStatus !== 'synced' && (
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
