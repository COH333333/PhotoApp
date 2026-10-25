import { useState } from 'react';

// Google Drive for one event: the folder, its view-only link for guests,
// and a catch-up for photos that aren't in Drive yet.
export default function DriveCard({ slug, ready, initialUrl, initialShared, initialRemaining }) {
  const [url, setUrl] = useState(initialUrl);
  const [shared, setShared] = useState(initialShared);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  if (!ready) {
    return (
      <div className="card">
        <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Google Drive</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Not connected. <a href="/admin/setup" style={{ color: 'inherit' }}>Connect Google Drive</a> and
          this event gets its own folder, shareable with guests.
        </p>
      </div>
    );
  }

  // Creates the folder if needed and copies photos a few at a time until
  // none are left (each request has a time limit).
  async function sync() {
    setBusy(true);
    setNote('');
    let total = 0;
    try {
      for (let round = 0; round < 60; round++) {
        const res = await fetch(`/api/admin/events/${slug}/drive`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNote(data.error || 'Google Drive had a problem. Try again.');
          return;
        }
        if (data.folderUrl) setUrl(data.folderUrl);
        setShared(data.shared);
        setRemaining(data.remaining);
        total += data.copied;
        setNote(data.remaining ? `Copied ${total}… ${data.remaining} to go` : `Done. Copied ${total}.`);
        if (!data.remaining) return;
        if (!data.copied) {
          setNote(`Copied ${total}; ${data.remaining} couldn't be copied. Try again in a minute.`);
          return;
        }
      }
    } catch {
      setNote('Connection dropped. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  return (
    <div className="card">
      <h2 className="display" style={{ fontSize: 16, marginTop: 0 }}>Google Drive</h2>
      {url ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {shared
              ? 'Shared view-only with anyone who has the link. Guests see a button for it on the album page.'
              : 'Private to your Google account. Turn on sharing in Event settings to give guests the link.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <a className="btn btn-secondary" href={url} target="_blank" rel="noreferrer">Open folder</a>
            {shared && <button className="btn btn-secondary" onClick={copyLink}>Copy guest link</button>}
          </div>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>No folder yet. It's made with the first photo, or now:</p>
      )}
      {(remaining > 0 || !url) && (
        <button className="btn btn-primary" onClick={sync} disabled={busy}>
          {busy ? 'Working…' : !url ? 'Create Drive folder' + (remaining ? ` and copy ${remaining} photos` : '') : `Copy ${remaining} missing photo${remaining === 1 ? '' : 's'} to Drive`}
        </button>
      )}
      {note && <p className="muted" role="status" style={{ marginBottom: 0 }}>{note}</p>}
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 10 }}>
        Only photos visible in the album are copied; hiding or deleting one moves its copy to Drive's
        trash. Video clips stay in the app.
      </p>
    </div>
  );
}
