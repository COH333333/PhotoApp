import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getEvent, getAiUsage } from '../../../lib/store';
import { publicPresets, publicBackdrops } from '../../../lib/presets';
import { isAiConfigured } from '../../../lib/fal';
import { getOrCreateGuestId } from '../../../lib/guest';
import { aiLimitsFor } from '../../../lib/aiLimits';
import CameraCapture from '../../../components/CameraCapture';

export async function getServerSideProps({ params, req, res }) {
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };

  const aiOn = isAiConfigured();
  const presets = aiOn ? publicPresets(event) : [];
  const limits = aiLimitsFor(event);
  // Issue the guest cookie here; the AI edit API requires it.
  const guestId = getOrCreateGuestId(req, res);
  const usage = await getAiUsage(event.slug, guestId);
  const remaining = Math.max(
    0,
    Math.min(limits.perGuest - usage.guest, limits.perEvent - usage.total)
  );

  return {
    props: {
      event: {
        slug: event.slug,
        name: event.name,
        primaryColor: event.primaryColor,
        accentColor: event.accentColor,
      },
      presets,
      backdrops: presets.length ? publicBackdrops(event) : [],
      initialRemaining: presets.length ? remaining : 0,
    },
  };
}

// Steps: capture → review → (selfie) → working → result → posting → done
export default function GuestCapturePage({ event, presets, backdrops, initialRemaining }) {
  const [step, setStep] = useState('capture');
  const [photo, setPhoto] = useState(null); // prepared JPEG Blob
  const [photoUrl, setPhotoUrl] = useState(null);
  const [preset, setPreset] = useState(null);
  const [edit, setEdit] = useState(null); // { editId, resultUrl, label }
  const [showOriginal, setShowOriginal] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [message, setMessage] = useState('');
  const [postFailed, setPostFailed] = useState(null); // what we tried to post
  const [backdrop, setBackdrop] = useState(null);

  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  function startOver() {
    setPhoto(null);
    setPhotoUrl(null);
    setPreset(null);
    setEdit(null);
    setShowOriginal(false);
    setMessage('');
    setPostFailed(null);
    setBackdrop(null);
    setStep('capture');
  }

  function handlePhoto(blob) {
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setEdit(null);
    setMessage('');
    setStep('review');
  }

  function choosePreset(p) {
    setPreset(p);
    setMessage('');
    setBackdrop(null);
    if (p.needsBackdrop) setStep('backdrop');
    else if (p.needsSelfie) setStep('selfie');
    else runEdit(p, null);
  }

  async function runEdit(p, selfie, chosenBackdrop) {
    setStep('working');
    const form = new FormData();
    form.append('preset', p.id);
    form.append('photo', photo, 'photo.jpg');
    if (selfie) form.append('selfie', selfie, 'selfie.jpg');
    if (chosenBackdrop) form.append('backdropId', chosenBackdrop.id);
    try {
      const res = await fetch(`/api/events/${event.slug}/ai-edit`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
      if (!res.ok) {
        setMessage(data.error || "That edit didn't work. Try again, or post the original.");
        setStep('review');
        return;
      }
      setEdit(data);
      setShowOriginal(false);
      setStep('result');
    } catch {
      setMessage('Connection dropped. Check your signal and try again.');
      setStep('review');
    }
  }

  async function post(useEdit) {
    setStep('posting');
    setPostFailed(null);
    const form = new FormData();
    form.append('photo', photo, 'photo.jpg');
    if (useEdit && edit) form.append('editId', edit.editId);
    try {
      const res = await fetch(`/api/events/${event.slug}/photos`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.expired) setEdit(null);
        setPostFailed({ useEdit: useEdit && !data.expired, error: data.error });
        setStep('postError');
        return;
      }
      setStep('done');
    } catch {
      setPostFailed({ useEdit, error: 'Check your connection and try again.' });
      setStep('postError');
    }
  }

  const aiAvailable = presets.length > 0;

  return (
    <div className="page" style={{ '--event-primary': event.primaryColor, '--event-accent': event.accentColor }}>
      <Head>
        <title>{`${event.name} - Moment Share`}</title>
      </Head>
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h1 className="display" style={{ fontSize: 22 }}>{event.name}</h1>
          <Link href={`/e/${event.slug}/gallery`} className="muted" style={{ textDecoration: 'none' }}>
            View album
          </Link>
        </div>

        {step === 'capture' && (
          <div style={{ paddingTop: 24 }}>
            <CameraCapture onPhoto={handlePhoto} />
          </div>
        )}

        {step === 'review' && (
          <div>
            <img src={photoUrl} alt="Your photo" className="preview" />
            <div style={{ display: 'flex', gap: 10, margin: '14px 0 28px' }}>
              <button className="btn btn-secondary" onClick={startOver} style={{ flex: 1 }}>Retake</button>
              <button className="btn btn-primary" onClick={() => post(false)} style={{ flex: 2 }}>Post photo</button>
            </div>

            {aiAvailable && (
              <section aria-labelledby="ai-heading">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h2 id="ai-heading" className="display" style={{ fontSize: 17, margin: 0 }}>Or try an AI edit</h2>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {remaining > 0 ? `${remaining} left` : 'None left'}
                  </span>
                </div>
                {message && <p className="notice" role="status">{message}</p>}
                <div className="preset-grid">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      className="preset-chip"
                      onClick={() => choosePreset(p)}
                      disabled={remaining <= 0}
                    >
                      <span className="preset-label">{p.label}</span>
                      <span className="preset-blurb">{p.blurb}</span>
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
                  Edits are made by an AI model and labeled in the album. Your original is kept too.
                </p>
              </section>
            )}
            {!aiAvailable && message && <p className="notice" role="status">{message}</p>}
          </div>
        )}

        {step === 'backdrop' && (
          <div>
            <p className="display" style={{ fontSize: 19, textAlign: 'center', margin: '0 0 6px' }}>
              Which photo do you want to be in?
            </p>
            <p className="muted" style={{ textAlign: 'center', marginTop: 0, marginBottom: 14 }}>
              You'll be added standing beside us, using the photo you just took.
            </p>
            <div className="your-photo">
              <img src={photoUrl} alt="The photo you just took" />
              <span>
                This is who gets added. If it isn't a photo of you, go back and take one.
              </span>
            </div>
            {backdrops.length === 0 && (
              <p className="notice" role="status">
                Those photos aren't available right now. You can still post your own.
              </p>
            )}
            <div className="backdrop-grid">
              {backdrops.map((b) => (
                <button
                  key={b.id}
                  className="backdrop-choice"
                  onClick={() => {
                    setBackdrop(b);
                    runEdit(preset, null, b);
                  }}
                >
                  <img src={b.url} alt="Wedding portrait" loading="lazy" />
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button className="btn btn-secondary" onClick={() => setStep('review')}>Back</button>
            </div>
          </div>
        )}

        {step === 'selfie' && (
          <div style={{ paddingTop: 8 }}>
            <p className="display" style={{ fontSize: 19, textAlign: 'center', margin: '0 0 6px' }}>Now a quick selfie</p>
            <p className="muted" style={{ textAlign: 'center', marginTop: 0, marginBottom: 28 }}>
              Face the camera, good light helps. It's only used for this edit and isn't saved.
            </p>
            <CameraCapture
              facing="user"
              hint="Tap to take a selfie"
              maxEdge={1024}
              onPhoto={(selfie) => runEdit(preset, selfie)}
            />
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setStep('review')}>Back</button>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div>
            <div className="working-frame">
              <img src={preset?.needsBackdrop && backdrop ? backdrop.url : photoUrl} alt="" className="preview" />
              <div className="working-overlay">
                <span className="spinner" aria-hidden="true" />
                <span>{preset?.label}…</span>
              </div>
            </div>
            <p className="muted" style={{ textAlign: 'center' }} role="status">
              Usually takes 10 to 20 seconds. Keep this page open.
            </p>
          </div>
        )}

        {step === 'result' && edit && (
          <div>
            <img
              src={showOriginal ? photoUrl : edit.resultUrl}
              alt={showOriginal ? 'Original photo' : `${edit.label} edit`}
              className="preview"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 16px' }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {showOriginal ? (preset?.needsBackdrop ? 'Your photo' : 'Original') : edit.label}
              </span>
              <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? 'Show edit' : preset?.needsBackdrop ? 'Show your photo' : 'Compare with original'}
              </button>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => post(true)}>Post this edit</button>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setEdit(null); setBackdrop(null); setStep('review'); }}>
                Try another edit
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => post(false)}>
                {preset?.needsBackdrop ? 'Post my photo' : 'Post original'}
              </button>
            </div>
          </div>
        )}

        {step === 'posting' && (
          <p className="muted" style={{ textAlign: 'center', paddingTop: 48 }} role="status">
            Adding your photo to the album…
          </p>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 32 }}>
            <p className="display" style={{ fontSize: 20, marginBottom: 8 }}>Added to the album</p>
            <p className="muted" style={{ marginBottom: 24 }}>Thanks for sharing the moment.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={startOver}>Add another photo</button>
              <Link href={`/e/${event.slug}/gallery`} className="btn btn-secondary">View album</Link>
            </div>
          </div>
        )}

        {step === 'postError' && (
          <div style={{ textAlign: 'center', paddingTop: 32 }}>
            <p className="display" style={{ fontSize: 20, marginBottom: 8 }}>That upload didn't go through</p>
            <p className="muted" style={{ marginBottom: 24 }}>
              {postFailed?.error || 'Check your connection and try again.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, margin: '0 auto' }}>
              <button className="btn btn-primary" onClick={() => post(postFailed?.useEdit)}>
                {postFailed?.useEdit ? 'Retry posting the edit' : 'Retry'}
              </button>
              {postFailed?.useEdit && (
                <button className="btn btn-secondary" onClick={() => post(false)}>Post the original instead</button>
              )}
              <button className="btn btn-secondary" onClick={startOver}>Start over</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
