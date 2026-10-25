import { useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import ImageViewer from '../../components/ImageViewer';
import ModelSwitch from '../../components/ModelSwitch';
import { MODELS } from '../../lib/models';
import { isAdminRequest } from '../../lib/auth';
import { getGlobalSamples, getHiddenPresets, getPromptOverrides, getPresetModels, getStyleCustom } from '../../lib/store';
import { withVersions } from '../../lib/samples';
import {
  presetSummaries,
  DEFAULT_COST,
  defaultPromptTemplate,
  defaultLabelTemplate,
  defaultBlurbTemplate,
  MAX_LABEL,
  MAX_BLURB,
} from '../../lib/presets';
import { subjectFor } from '../../lib/templates';
import { isAiConfigured } from '../../lib/fal';
import { preparePhoto } from '../../lib/heicConvert';

// One photo, every style, once. These become the previews guests see at
// every event unless an event makes its own.
export async function getServerSideProps({ req }) {
  if (!isAdminRequest(req)) return { redirect: { destination: '/admin/login', permanent: false } };
  const samples = withVersions(await getGlobalSamples());
  // Prompts are sent only to this signed-in page, never to guests.
  const chosen = await getPresetModels();
  const custom = await getStyleCustom();
  // Built-in names here, in the saved order; renames are applied in the page
  // so they update live as the admin types.
  const all = presetSummaries({}, [], chosen, { order: custom.order }).map((p) => ({
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    labelTemplate: defaultLabelTemplate(p.id),
    blurbTemplate: defaultBlurbTemplate(p.id),
    previewable: p.previewable,
    defaultPrompt: defaultPromptTemplate(p.id),
    tier: p.tier,
    defaultTier: p.defaultTier,
  }));
  const overrides = await getPromptOverrides();
  return {
    props: {
      samples,
      all,
      initialHidden: await getHiddenPresets(),
      initialOverrides: overrides,
      initialLabels: custom.labels,
      subject: subjectFor({}),
      maxLabel: MAX_LABEL,
      maxBlurb: MAX_BLURB,
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

// Full / Lite switch for one style.
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

function RenameSheet({ style, saved, onSave, onClose, maxLabel, maxBlurb }) {
  const [label, setLabel] = useState(saved?.label || style.labelTemplate);
  const [blurb, setBlurb] = useState(saved?.blurb || style.blurbTemplate);
  const [state, setState] = useState('');
  const isCustom = Boolean(saved?.label || saved?.blurb);

  async function save(l, b) {
    setState('Saving…');
    const ok = await onSave(style.id, l, b);
    setState(ok ? 'Saved' : 'Could not save');
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet prompt-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rename style">
        <p className="display" style={{ fontSize: 17, margin: 0 }}>Rename style</p>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
          What guests and the event pages show. <code>{'{subject}'}</code> becomes who the event is for
          (e.g. "the couple"). Applies to every event as soon as you save.
        </p>
        <div className="field">
        <label htmlFor="rename-label">Name</label>
        <input
          id="rename-label"
          value={label}
          maxLength={maxLabel}
          onChange={(e) => { setLabel(e.target.value); setState(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) save(label, blurb); }}
          autoFocus
        />
        </div>
        <div className="field">
        <label htmlFor="rename-blurb">Short description</label>
        <input
          id="rename-blurb"
          value={blurb}
          maxLength={maxBlurb}
          onChange={(e) => { setBlurb(e.target.value); setState(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) save(label, blurb); }}
        />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
          Built-in: {style.labelTemplate} · {style.blurbTemplate}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!label.trim() || state === 'Saving…'} onClick={() => save(label, blurb)}>Save</button>
          {isCustom && (
            <button
              className="btn btn-secondary"
              onClick={() => { setLabel(style.labelTemplate); setBlurb(style.blurbTemplate); save('', ''); }}
            >
              Reset to built-in
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {state && <span className="muted" role="status">{state}</span>}
        </div>
      </div>
    </div>
  );
}

// Drag handle for reordering. Pointer events, so it works with a mouse and
// with a finger on a phone; the handle alone has touch-action: none so the
// rest of the page still scrolls normally.
function DragHandle({ id, onStart, label }) {
  return (
    <span
      className="drag-handle"
      role="button"
      tabIndex={0}
      aria-label={`Drag to reorder ${label}`}
      title="Drag to reorder"
      onPointerDown={(e) => onStart(e, id)}
    >
      ⠿
    </span>
  );
}

export default function SamplesPage({ samples: initial, all: allBase, initialHidden, initialOverrides, initialLabels, subject, maxLabel, maxBlurb, aiConfigured, cost }) {
  // --- Names and order ---------------------------------------------------
  const [labels, setLabels] = useState(initialLabels || {});
  const [order, setOrder] = useState(() => allBase.map((p) => p.id));
  const [renaming, setRenaming] = useState(null);
  const [orderState, setOrderState] = useState('');
  const [dragging, setDragging] = useState(null);
  const byId = Object.fromEntries(allBase.map((p) => [p.id, p]));
  const fill = (t) => (t ? t.split('{subject}').join(subject) : null);
  const all = order
    .filter((id) => byId[id])
    .map((id) => ({
      ...byId[id],
      label: fill(labels[id]?.label) || byId[id].label,
      blurb: fill(labels[id]?.blurb) || byId[id].blurb,
      renamed: Boolean(labels[id]?.label || labels[id]?.blurb),
    }));

  async function saveName(id, label, blurb) {
    const res = await fetch('/api/admin/style-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label, blurb }),
    });
    if (!res.ok) return false;
    setLabels((await res.json()).labels);
    return true;
  }

  async function saveOrder(next) {
    setOrderState('Saving order…');
    const res = await fetch('/api/admin/style-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next }),
    });
    setOrderState(res.ok ? 'Order saved. Guests see styles in this order.' : 'Could not save the order. Try again.');
  }

  // Live reorder while dragging: whichever tile or row is under the pointer,
  // the dragged style moves into its place. Saved once on release.
  const orderRef = useRef(order);
  orderRef.current = order;
  function startDrag(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startOrder = orderRef.current;
    setDragging(id);
    function move(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest('[data-style-id]');
      const overId = target && target.getAttribute('data-style-id');
      if (!overId || overId === id) return;
      setOrder((cur) => {
        const from = cur.indexOf(id);
        const to = cur.indexOf(overId);
        if (from < 0 || to < 0) return cur;
        const next = [...cur];
        next.splice(from, 1);
        next.splice(to, 0, id);
        return next;
      });
    }
    function end() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDragging(null);
      const final = orderRef.current;
      if (final.join() !== startOrder.join()) saveOrder(final);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // Keyboard: arrow keys on a focused handle move the style one place.
  function nudge(id, delta) {
    const cur = orderRef.current;
    const visible = cur.filter((x) => byId[x]?.previewable === byId[id]?.previewable && !hidden.includes(x));
    const i = visible.indexOf(id);
    const swapWith = visible[i + delta];
    if (!swapWith) return;
    const next = [...cur];
    const a = next.indexOf(id);
    const b = next.indexOf(swapWith);
    [next[a], next[b]] = [next[b], next[a]];
    setOrder(next);
    saveOrder(next);
  }

  async function resetOrder() {
    if (!window.confirm('Put every style back in the built-in order?')) return;
    const res = await fetch('/api/admin/style-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: [] }),
    });
    if (res.ok) window.location.reload();
  }

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
  // Checks the version currently shown on the tile (Full or Lite).
  function isStale(id, tier = shownTier(id)) {
    const v = versionOf(id, tier);
    const made = v?.madeWith;
    if (!v || made === undefined) return false;
    if (made === 'default') return !overrides[id] ? REWRITTEN.includes(id) : true;
    const style = all.find((p) => p.id === id);
    return made !== fingerprint(overrides[id] || style.defaultPrompt);
  }


  const [samples, setSamples] = useState(initial);
  const [hidden, setHidden] = useState(initialHidden);
  const [tiers, setTiers] = useState(() => Object.fromEntries(all.map((p) => [p.id, p.tier])));
  const [modelState, setModelState] = useState('');

  async function setTier(ids, tier) {
    setModelState('Saving…');
    const res = await fetch('/api/admin/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, tier }),
    });
    if (res.ok) {
      const data = await res.json();
      setTiers(data.tiers);
      if (data.samples) setSamples(data.samples);
      setModelState(`Saved. Takes effect on the next edit at every event.`);
    } else {
      setModelState('Could not save. Try again.');
    }
  }

  // --- Full / Lite versions ---------------------------------------------
  // Every style can have a sample made on each model. `view` picks what the
  // whole grid shows ('use' = the model each style runs on, i.e. what guests
  // get); a tile's own Full/Lite tab overrides that for one style.
  const [view, setView] = useState('use');
  const [tileTab, setTileTab] = useState({});
  function versionOf(id, tier) {
    return samples.versions?.[tier]?.[id] || null;
  }
  function targetTier(id) {
    return view === 'use' ? tiers[id] : view;
  }
  function shownTier(id) {
    if (tileTab[id]) return tileTab[id];
    // "What guests get": if the style's own model has no sample yet, guests
    // are shown the other one, so show that here too.
    if (view === 'use' && !versionOf(id, tiers[id]) && samples.madeWithModel?.[id]) return samples.madeWithModel[id];
    return targetTier(id);
  }
  function shownUrl(id) {
    return versionOf(id, shownTier(id))?.url || null;
  }
  function changeView(v) {
    setView(v);
    setTileTab({});
  }
  // Guests see the Full sample while a Lite-set style has no Lite sample yet.
  function modelStale(id) {
    return Boolean(samples.previews?.[id]) && samples.madeWithModel?.[id] !== tiers[id];
  }
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
    if (Object.keys(samples.previews || {}).length && !window.confirm('Replacing the photo removes every sample (Full and Lite) made from it. Continue?')) return;
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

  async function make(id, tier = shownTier(id)) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: id, tier }),
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

  const staleList = styles.filter((p) => isStale(p.id));
  const staleCost = staleList.reduce((sum, p) => sum + MODELS[shownTier(p.id)].cost, 0);

  async function remakeStale() {
    setLog('');
    const todo = staleList.map((p) => ({ p, t: shownTier(p.id) }));
    for (const { p, t } of todo) {
      setLog(`Remaking ${p.label} on ${MODELS[t].label}…`);
      if (!(await make(p.id, t))) return;
    }
    setLog('Done.');
  }

  // Missing samples for what the grid is showing: each style's own model, or
  // every style on Full / on Lite.
  const missingList = styles.filter((p) => !versionOf(p.id, targetTier(p.id)));
  const missingCost = missingList.reduce((sum, p) => sum + MODELS[targetTier(p.id)].cost, 0);

  async function makeAll() {
    setLog('');
    const todo = missingList.map((p) => ({ p, t: targetTier(p.id) }));
    for (const { p, t } of todo) {
      setLog(`Making ${p.label} on ${MODELS[t].label}…`);
      if (!(await make(p.id, t))) return;
    }
    setLog(todo.length ? 'Done.' : 'Every style already has a sample.');
  }

  async function removeAll() {
    if (!window.confirm('Remove the sample photo and every sample?')) return;
    const res = await fetch('/api/admin/samples', { method: 'DELETE' });
    if (res.ok) setSamples(await res.json());
  }

  const [zipState, setZipState] = useState('');

  // Fetches every sample through our own API (one small request each, so no
  // size limits or cross-site rules get in the way), zips them in the
  // browser, and saves the file.
  async function downloadAllSamples() {
    const list = all.filter((p) => shownUrl(p.id));
    if (!list.length) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    let done = 0;
    const failed = [];
    const pad = String(list.length).length;
    async function grab(id, name, tier = '') {
      const res = await fetch(`/api/admin/sample-image?id=${encodeURIComponent(id)}&tier=${tier}`);
      if (!res.ok) throw new Error(id);
      zip.file(name, await res.blob());
    }
    if (samples.sampleUrl) {
      await grab('source', '00 - Original sample photo.jpg').catch(() => failed.push('Original'));
    }
    // A few at a time: quick, without opening fifty requests at once.
    const queue = list.map((p, i) => ({ p, i }));
    async function worker() {
      while (queue.length) {
        const { p, i } = queue.shift();
        const safe = p.label.replace(/[\\/:*?"<>|]+/g, '-');
        try {
          const t = shownTier(p.id);
          await grab(p.id, `${String(i + 1).padStart(pad, '0')} - ${safe} (${MODELS[t].label}).jpg`, t);
        } catch {
          failed.push(p.label);
        }
        done += 1;
        setZipState(`Collecting ${done}/${list.length}…`);
      }
    }
    setZipState(`Collecting 0/${list.length}…`);
    await Promise.all([worker(), worker(), worker(), worker()]);
    setZipState('Zipping…');
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moment-share-style-samples-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    setZipState(failed.length ? `Saved, but ${failed.length} couldn't be fetched: ${failed.join(', ')}` : 'Saved.');
  }

  // The viewer walks through the samples in the same order as the grid.
  const [viewing, setViewing] = useState(null);
  const viewerItems = styles
    .filter((p) => shownUrl(p.id))
    .map((p) => ({
      id: p.id,
      url: shownUrl(p.id),
      title: `${p.label} · ${MODELS[shownTier(p.id)].label}`,
      subtitle: `${p.blurb} · made on ${MODELS[shownTier(p.id)].label}${shownTier(p.id) === tiers[p.id] ? ' (what guests get)' : ''}`,
    }));
  function openViewer(id) {
    const i = viewerItems.findIndex((x) => x.id === id);
    if (i >= 0) setViewing(i);
  }

  const made = styles.length - missingList.length;
  const totalSamples = all.filter((p) => shownUrl(p.id)).length;
  const missing = missingList.length;

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <a className="btn btn-secondary" href="/api/admin/prompts-export">Download prompts (Excel)</a>
          <button
            className="btn btn-secondary"
            disabled={!totalSamples || (zipState && !/^Saved/.test(zipState))}
            onClick={() => downloadAllSamples().catch(() => setZipState('Something went wrong. Try again.'))}
          >
            Download all samples ({totalSamples}) as .zip
          </button>
          {zipState && <span className="muted" role="status">{zipState}</span>}
        </div>

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
              <span className="muted">{missing ? `${missing} to make · about $${missingCost.toFixed(2)}` : 'Complete'}</span>
            </div>
            {!aiConfigured && <p className="notice-dark">AI isn't set up yet (FAL_KEY missing).</p>}
            <div className="view-bar">
              <span className="muted" style={{ fontSize: 12.5 }}>Show</span>
              <span className="model-switch" role="group" aria-label="Which samples to show">
                {[
                  ['use', 'What guests get'],
                  ['full', `All ${MODELS.full.label}`],
                  ['lite', `All ${MODELS.lite.label}`],
                ].map(([v, text]) => (
                  <button key={v} type="button" className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => changeView(v)}>
                    {text}
                  </button>
                ))}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Tap Full / Lite under any picture to compare one style. ★ = the model guests get.
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
              Drag a style by its <span aria-hidden="true">⠿</span> handle to reorder. Guests and event pages
              show styles in this order.{' '}
              <button className="muted" style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }} onClick={resetOrder}>
                Reset order
              </button>
              {orderState && <span role="status"> · {orderState}</span>}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
              {styles.map((p) => (
                <div
                  key={p.id}
                  data-style-id={p.id}
                  className={`style-tile${dragging === p.id ? ' is-dragging' : ''}`}
                  style={{ width: 120, textAlign: 'center', position: 'relative' }}
                  onKeyDown={(e) => {
                    if (!e.target.classList?.contains('drag-handle')) return;
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); nudge(p.id, -1); }
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nudge(p.id, 1); }
                  }}
                >
                  <DragHandle id={p.id} onStart={startDrag} label={p.label} />
                  {shownUrl(p.id) ? (
                    <button className="thumb-button" onClick={() => openViewer(p.id)} aria-label={`View ${p.label} (${MODELS[shownTier(p.id)].label}) larger`}>
                      <img src={shownUrl(p.id)} alt={`${p.label}, ${MODELS[shownTier(p.id)].label}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 3 }} />
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      style={{ width: 120, height: 120, padding: 0, fontSize: 12 }}
                      disabled={busy !== null || !samples.sampleUrl || !aiConfigured}
                      onClick={() => { setLog(''); make(p.id, shownTier(p.id)); }}
                    >
                      {busy === p.id ? 'Making…' : `Make ${MODELS[shownTier(p.id)].label}`}
                    </button>
                  )}
                  <div className="version-tabs" role="tablist" aria-label={`${p.label} versions`}>
                    {Object.keys(MODELS).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={shownTier(p.id) === t}
                        className={`${shownTier(p.id) === t ? 'is-on' : ''}${versionOf(p.id, t) ? '' : ' is-empty'}`}
                        title={`${versionOf(p.id, t) ? 'Show' : 'Not made yet:'} ${MODELS[t].name} sample${tiers[p.id] === t ? ' (guests get this model)' : ''}`}
                        onClick={() => setTileTab((cur) => ({ ...cur, [p.id]: t }))}
                      >
                        {MODELS[t].label}
                        {tiers[p.id] === t && <span aria-hidden="true"> ★</span>}
                      </button>
                    ))}
                  </div>
                  <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {p.label}
                    {p.renamed && <span className="tiny-tag">renamed</span>}
                    {overrides[p.id] && <span className="tiny-tag">edited</span>}
                    {modelStale(p.id) && view === 'use' && !tileTab[p.id] && (
                      <span className="tiny-tag is-warn">guests see the {MODELS[samples.madeWithModel?.[p.id] || 'full'].label} sample</span>
                    )}
                    {isStale(p.id) && (
                      <span className="tiny-tag is-warn">sample out of date</span>
                    )}
                  </span>
                  <ModelSwitch value={tiers[p.id]} onChange={(t) => setTier([p.id], t)} disabled={busy !== null} compact />
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="muted"
                      style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setRenaming(p)}
                    >
                      rename
                    </button>
                    <button
                      className="muted"
                      style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setEditing(p)}
                    >
                      prompt
                    </button>
                    {shownUrl(p.id) && (
                      <button className="muted" style={{ background: 'none', border: 0, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }} disabled={busy !== null} onClick={() => make(p.id, shownTier(p.id))}>
                        remake {MODELS[shownTier(p.id)].label}
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
              <button className="btn btn-primary" disabled={busy !== null || !samples.sampleUrl || !aiConfigured} onClick={makeAll}>
                {view === 'use' ? 'Make all missing' : `Make all missing ${MODELS[view].label}`}
              </button>
              {staleList.length > 0 && (
                <button className="btn btn-secondary" disabled={busy !== null || !aiConfigured} onClick={remakeStale}>
                  Remake out of date ({staleList.length}) · about ${staleCost.toFixed(2)}
                </button>
              )}
              {log && <span className="muted" role="status">{log}</span>}
            </div>

            <div className="model-panel">
              <div>
                <strong>AI model per style.</strong>{' '}
                <span className="muted">
                  Full ({MODELS.full.name}, about ${MODELS.full.cost.toFixed(2)} an edit) keeps faces most exactly.
                  Lite ({MODELS.lite.name}, about ${MODELS.lite.cost.toFixed(3).replace(/0$/, '')}) is cheaper and faster.
                  The switch under each style sets which one guests' edits use, at every event.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setTier(styles.map((p) => p.id), 'lite')}>
                  All looks → Lite
                </button>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setTier(styles.map((p) => p.id), 'full')}>
                  All looks → Full
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 13 }}
                  onClick={async () => {
                    const groups = { full: [], lite: [] };
                    for (const p of all) groups[p.defaultTier].push(p.id);
                    await setTier(groups.full, 'full');
                    await setTier(groups.lite, 'lite');
                  }}
                >
                  Recommended
                </button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {Object.values(tiers).filter((t) => t === 'lite').length} on Lite ·{' '}
                  {Object.values(tiers).filter((t) => t === 'full').length} on Full
                </span>
                {modelState && <span className="muted" role="status" style={{ fontSize: 12.5 }}>{modelState}</span>}
              </div>
            </div>

            <h3 className="display" style={{ fontSize: 14, margin: '28px 0 8px' }}>Other edits</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>These use the guest's own input, so they have no sample.</p>
            {all.filter((p) => !p.previewable && !hidden.includes(p.id)).map((p) => (
              <div
                key={p.id}
                data-style-id={p.id}
                className={dragging === p.id ? 'is-dragging' : ''}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', gap: 8 }}
                onKeyDown={(e) => {
                  if (!e.target.classList?.contains('drag-handle')) return;
                  if (e.key === 'ArrowUp') { e.preventDefault(); nudge(p.id, -1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); nudge(p.id, 1); }
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DragHandle id={p.id} onStart={startDrag} label={p.label} />
                  <span>
                    <strong>{p.label}</strong> <span className="muted">{p.blurb}</span>
                    {p.renamed && <span className="tiny-tag">renamed</span>}
                    {overrides[p.id] && <span className="tiny-tag">edited</span>}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setRenaming(p)}>Rename</button>
                  <ModelSwitch value={tiers[p.id]} onChange={(t) => setTier([p.id], t)} />
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
      {viewing !== null && viewerItems.length > 0 && (
        <ImageViewer
          items={viewerItems}
          startIndex={Math.min(viewing, viewerItems.length - 1)}
          original={samples.sampleUrl}
          onClose={() => setViewing(null)}
        />
      )}
      {renaming && (
        <RenameSheet
          key={renaming.id}
          style={renaming}
          saved={labels[renaming.id]}
          onSave={saveName}
          onClose={() => setRenaming(null)}
          maxLabel={maxLabel}
          maxBlurb={maxBlurb}
        />
      )}
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
