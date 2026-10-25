import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { isDriveConnected, isDriveConfigured, getConnectedEmail } from '../../lib/drive';
import { getDriveRoot } from '../../lib/store';

export async function getServerSideProps({ req, query }) {
  if (!isAdminRequest(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  const configured = isDriveConfigured();
  const connected = configured && (await isDriveConnected());
  return {
    props: {
      configured,
      connected,
      email: connected ? await getConnectedEmail() : null,
      root: connected ? (await getDriveRoot()) || null : null,
      error: typeof query.error === 'string' ? query.error : null,
    },
  };
}

export default function AdminSetup({ configured, connected, email, root: initialRoot, error }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [root, setRoot] = useState(initialRoot);
  const [rootName, setRootName] = useState(initialRoot?.name || 'Moment Share');
  const [rootState, setRootState] = useState('');

  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? New photos will stop being copied to Drive until you connect again.')) return;
    setDisconnecting(true);
    await fetch('/api/auth/google/disconnect', { method: 'POST' });
    window.location.href = '/admin/setup';
  }

  async function saveRootName(e) {
    e.preventDefault();
    setRootState('Saving…');
    const res = await fetch('/api/admin/drive-root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rootName }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRoot({ ...(root || {}), name: data.name, url: data.url });
      setRootState('Saved');
    } else {
      setRootState(data.error || 'Could not save.');
    }
  }

  return (
    <div className="admin-shell page">
      <Head>
        <title>Connect Drive - Moment Share</title>
      </Head>
      <div className="container" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <Link href="/admin" className="muted" style={{ textDecoration: 'none' }}>
          &larr; Back to dashboard
        </Link>
        <h1 className="display" style={{ fontSize: 26, marginTop: 16, marginBottom: 16 }}>
          Google Drive
        </h1>

        {error && error !== 'not_configured' && (
          <p className="notice-dark">Google said: {error}. Try again, and choose the account you want.</p>
        )}

        {!configured && (
          <div className="card">
            <strong>Not set up yet</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              The Google sign-in keys aren't in Vercel yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
              GOOGLE_REDIRECT_URI). Create them in Google Cloud while signed in to the account the photos
              should go to, add them in Vercel, and this page will offer to connect.
            </p>
          </div>
        )}

        {configured && !connected && (
          <div className="card">
            <p className="muted">
              Authorize this app to create folders and upload files in your Google Drive. Google will ask
              which account to use. The app can only see the folders and files it creates, nothing else
              in your Drive.
            </p>
            <a href="/api/auth/google" className="btn btn-primary">
              Connect Google Drive
            </a>
          </div>
        )}

        {configured && connected && (
          <>
            <div className="card">
              <strong>Connected{email ? ` as ${email}` : ''}</strong>
              <p className="muted">
                Each event gets its own folder inside the main folder below. Photos are copied there once
                they're visible in the album.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="/api/auth/google" className="btn btn-secondary">Switch to a different account</a>
                <button className="btn btn-secondary" onClick={disconnect} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}>
                Switching accounts starts new folders in the new account; photos already copied stay where
                they are.
              </p>
            </div>

            <form className="card" style={{ marginTop: 16 }} onSubmit={saveRootName}>
              <strong>Main folder</strong>
              <p className="muted">
                Every event's folder goes inside this one. You can rename it here, or rename or move it in
                Google Drive yourself; the app keeps finding it.
              </p>
              <div className="field">
                <label htmlFor="root-name">Folder name</label>
                <input
                  id="root-name"
                  value={rootName}
                  maxLength={100}
                  onChange={(e) => { setRootName(e.target.value); setRootState(''); }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-primary">Save name</button>
                {root?.url && (
                  <a className="btn btn-secondary" href={root.url} target="_blank" rel="noreferrer">
                    Open in Google Drive
                  </a>
                )}
                {rootState && <span className="muted" role="status">{rootState}</span>}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
