import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { getGlobalSamples, getHiddenPresets, getPromptOverrides } from '../../lib/store';
import { presetSummaries, DEFAULT_COST, defaultPromptTemplate } from '../../lib/presets';
import { isAiConfigured } from '../../lib/fal';
import { preparePhoto } from '../../lib/heicConvert';

// One photo, every style, once. These become the previews guests see at
// every event unless an event makes its own.
export async function getServerSideProps({ req }) {
  if (!isAdminRequest(req)) return { redirect: { destination: '/admin/login', permanent: false } };
  const samples = await getGlobalSamples();
  // Prompts are sent only to this signed-in page, never to guests.
  const all = presetSummaries({}).map((p) => ({
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    previewable: p.previewable,
    defaultPrompt: defaultPromptTemplate(p.id),
  }));
  const overrides = await getPromptOverrides();
  return {
    props: {
      samples,
      all,
      initialHidden: await getHiddenPresets(),
      initialOverrides: overrides,
      aiConfigured: isAiConfigured(),
      cost: DEFAULT_COST,
    },
  };
}

function fingerprint(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function PromptEditor({ style, override, onSave, onClose }) {
  const [text, setText] = useState(override || style.defaultPrompt);
  const [state, setState] = useState('');
  const changed = text.trim() !== (override || style.defaultPrompt).trim();

  async function save(value) {
    setState('Saving…');
    const ok = await onSave(style.id, value);
    setState(ok ? 'Saved' : 'Could not save');
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet prompt-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${style.label} prompt`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p className="display" style={{ fontSize: 17, margin: 0 }}>{style.label}</p>
          <span className="muted" style={{ fontSize: 12 }}>{override ? 'Edited' : 'Built-in prompt'}</span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>
          Sent to the AI with the guest's photo. <code>{'{subject}'}</code> becomes who the event is for
          (e.g. "the couple"); <code>{'{keepsake_text}'}</code> becomes the keepsake frame text. Applies to
          every event as soon as you save.
        </p>
        <textarea
          className="prompt-text"
          value={text}
          onChange={(e) => { setText(e.target.value); setState(''); }}
          rows={12}
          spellCheck
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn btn-primary" disabled={!changed || state === 'Saving…'} onClick={() => save(text)}>Save</button>
          {override && (
            <button
              className="btn btn-secondary"
              onClick={() => { setText(style.defaultPrompt); save(''); }}
            >
              Reset to built-in
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {state && <span className="muted" role="status">{state}</span>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Tip: keep the lines about keeping every person recognizable and the same number of people —
          they're what stop the AI changing faces or inventing guests.
        </p>
      </div>
    </div>
  );
}

export default function SamplesPage({ samples: initial, all, initialHidden, initialOverrides, aiConfigured, cost }) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [editing, setEditing] = useState(null);

  async function savePrompt(id, text) {
    const res = await fetch('/api/admin/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, text }),
    });
    if (!res.ok) return false;
    setOverrides((await res.json()).overrides);
    return true;
  }

  // A sample is out of date when the prompt it was made with differs from
  // the one that would be used now, whether edited here or changed in code.
  // Samples from before fingerprints were recorded say 'default'; of those,
  // only the styles whose built-in prompt was rewritten since are flagged.
  const REWRITTEN = [
    'jazz-1920s', 'fifties', 'seventies', 'nineties', 'y2k', 'victorian', 'saigon-1960s',
    'royal-court', 'red-carpet', 'hoi-an', 'year-2085', 'throwback-1985',
  ];
  function isStale(id) {
    const made = samples.madeWith?.[id];
    if (!samples.previews?.[id] || made === undefined) return false;
    if (made === 'default') return !overrides[id] ? REWRITTEN.includes(id) : true;
    const style = all.find((p) => p.id === id);
    return made !== fingerprint(overrides[id] || style.defaultPrompt);
  }


  const [samples, setSamples] = useState(initial);
  const [hidden, setHidden] = useState(initialHidden);
  const styles = all.filter((p) => p.previewable && !hidden.includes(p.id));
  const removed = all.filter((p) => hidden.includes(p.id));

  async function setStyleHidden(id, value) {
    const res = await fetch('/api/admin/styles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hidden: value }),
    });
    if (res.ok) setHidden((await res.json()).hidden);
  }
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

  const made = styles.filter((p) => samples.previews?.[p.id]).length;
  const missing = styles.length - made;

  return (
    <div className="admin-shell page">
      <Head>
        <title>Style library - Moment Share</title>
      </Head>
      <div className="wide-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <Link href="/admin" className="muted" style={{ textDecoration: 'none' }}>&larr; All events</Link>
        <h1 className="display" style={{ fontSize: 28, marginTop: 8, marginBottom: 8 }}>Style library</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          One photo, rendered once in every style. Guests at every event see these when choosing a
          style, so nobody spends an edit just to look. {`$${cost.toFixed(2)}`} per style, once.
          Pick a photo with two or three people, faces clear, some background — the styles show
          best on a scene, not a close-up. <strong>Remove</strong> takes a style out of the whole app
          (every event); it can be restored from the bottom of this page.
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
                  <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {p.label}
                    {overrides[p.id] && <span className="tiny-tag">edited</span>}
                    {isStale(p.id) && <span className="tiny-tag is-warn">sample out of date</span>}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="muted"
                      style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setEditing(p)}
                    >
                      prompt
                    </button>
                    {samples.previews?.[p.id] && (
                      <button className="muted" style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }} disabled={busy !== null} onClick={() => make(p.id)}>
                        remake
                      </button>
                    )}
                    <button
                      style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', color: '#e2a73b' }}
                      disabled={busy !== null}
                      onClick={() => setStyleHidden(p.id, true)}
                    >
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy !== null || !samples.sampleUrl || !aiConfigured} onClick={() => makeAll(true)}>
                Make all missing
              </button>
              {log && <span className="muted" role="status">{log}</span>}
            </div>

            <h3 className="display" style={{ fontSize: 14, margin: '28px 0 8px' }}>Other edits</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>These use the guest's own input, so they have no sample.</p>
            {all.filter((p) => !p.previewable && !hidden.includes(p.id)).map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <span>
                  <strong>{p.label}</strong> <span className="muted">{p.blurb}</span>
                  {overrides[p.id] && <span className="tiny-tag">edited</span>}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditing(p)}>Prompt</button>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setStyleHidden(p.id, true)}>Remove</button>
                </span>
              </div>
            ))}

            {removed.length > 0 && (
              <>
                <h3 className="display" style={{ fontSize: 14, margin: '28px 0 8px' }}>Removed ({removed.length})</h3>
                {removed.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <span className="muted">{p.label}</span>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setStyleHidden(p.id, false)}>Restore</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      {editing && (
        <PromptEditor
          key={editing.id}
          style={editing}
          override={overrides[editing.id] || null}
          onSave={savePrompt}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
