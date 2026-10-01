import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { getGlobalSamples } from '../../lib/store';
import { presetSummaries, DEFAULT_COST } from '../../lib/presets';
import { isAiConfigured } from '../../lib/fal';
import { preparePhoto } from '../../lib/heicConvert';

// One photo, every style, once. These become the previews guests see at
// every event unless an event makes its own.
export async function getServerSideProps({ req }) {
  if (!isAdminRequest(req)) return { redirect: { destination: '/admin/login', permanent: false } };
  const samples = await getGlobalSamples();
  const styles = presetSummaries({}).filter((p) => p.previewable);
  return { props: { samples, styles, aiConfigured: isAiConfigured(), cost: DEFAULT_COST } };
}

export default function SamplesPage({ samples: initial, styles, aiConfigured, cost }) {
  const [samples, setSamples] = useState(initial);
  const [busy, setBusy] = useState(null);
  const [log, setLog] = useState('');

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (Object.keys(samples.previews || {}).length && !window.confirm('Replacing the photo removes every sample made from it. Continue?')) return;
    setBusy('upload');
    try {
      const prepared = await preparePhoto(file);
      const form = new FormData();
      form.append('photo', prepared, 'sample.jpg');
      const res = await fetch('/api/admin/samples', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setLog(data.error || 'Could not upload.');
      else setSamples(data);
    } finally {
      setBusy(null);
    }
  }

  async function make(id) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLog(data.error || 'Could not make that sample.');
        return false;
      }
      setSamples(data);
      return true;
    } catch {
      setLog('Connection dropped. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function makeAll(onlyMissing) {
    setLog('');
    const todo = styles.filter((p) => !onlyMissing || !samples.previews?.[p.id]);
    for (const p of todo) {
      setLog(`Making ${p.label}…`);
      if (!(await make(p.id))) return;
    }
    setLog(todo.length ? 'Done.' : 'Every style already has a sample.');
  }

  async function removeAll() {
    if (!window.confirm('Remove the sample photo and every sample?')) return;
    const res = await fetch('/api/admin/samples', { method: 'DELETE' });
    if (res.ok) setSamples(await res.json());
  }

  const made = Object.keys(samples.previews || {}).length;
  const missing = styles.length - made;

  return (
    <div className="admin-shell page">
      <Head>
        <title>Style samples - Moment Share</title>
      </Head>
      <div className="wide-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <Link href="/admin" className="muted" style={{ textDecoration: 'none' }}>&larr; All events</Link>
        <h1 className="display" style={{ fontSize: 28, marginTop: 8, marginBottom: 8 }}>Style samples</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          One photo, rendered once in every style. Guests at every event see these when choosing a
          style, so nobody spends an edit just to look. {`$${cost.toFixed(2)}`} per style, once.
          Pick a photo with two or three people, faces clear, some background — the styles show
          best on a scene, not a close-up.
        </p>

        <div className="admin-grid" style={{ marginTop: 24 }}>
          <div className="card" style={{ height: 'fit-content' }}>
            <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Sample photo</h2>
            {samples.sampleUrl ? (
              <img src={samples.sampleUrl} alt="Sample" style={{ width: '100%', borderRadius: 3, marginBottom: 12 }} />
            ) : (
              <p className="muted">No photo yet.</p>
            )}
            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {busy === 'upload' ? 'Uploading…' : samples.sampleUrl ? 'Replace photo' : 'Choose a photo'}
              <input type="file" accept="image/*,.heic,.heif" onChange={upload} style={{ display: 'none' }} disabled={busy !== null} />
            </label>
            {samples.sampleUrl && (
              <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={removeAll} disabled={busy !== null}>
                Remove everything
              </button>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h2 className="display" style={{ fontSize: 16, margin: 0 }}>Samples ({made}/{styles.length})</h2>
              <span className="muted">{missing ? `${missing} to make · about $${(missing * cost).toFixed(2)}` : 'Complete'}</span>
            </div>
            {!aiConfigured && <p className="notice-dark">AI isn't set up yet (FAL_KEY missing).</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
              {styles.map((p) => (
                <div key={p.id} style={{ width: 120, textAlign: 'center' }}>
                  {samples.previews?.[p.id] ? (
                    <img src={samples.previews[p.id]} alt={p.label} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 3 }} />
                  ) : (
                    <button
                      className="btn btn-secondary"
                      style={{ width: 120, height: 120, padding: 0, fontSize: 12 }}
                      disabled={busy !== null || !samples.sampleUrl || !aiConfigured}
                      onClick={() => { setLog(''); make(p.id); }}
                    >
                      {busy === p.id ? 'Making…' : 'Make'}
                    </button>
                  )}
                  <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{p.label}</span>
                  {samples.previews?.[p.id] && (
                    <button className="muted" style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }} disabled={busy !== null} onClick={() => make(p.id)}>
                      remake
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy !== null || !samples.sampleUrl || !aiConfigured} onClick={() => makeAll(true)}>
                Make all missing
              </button>
              {log && <span className="muted" role="status">{log}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
