import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { isDriveConnected, isDriveConfigured, getConnectedEmail } from '../../lib/drive';

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
      error: typeof query.error === 'string' ? query.error : null,
      justConnected: query.connected === '1',
    },
  };
}

export default function AdminSetup({ configured, connected, email, error, justConnected }) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? New photos will stop being copied to Drive until you connect again.')) return;
    setDisconnecting(true);
    await fetch('/api/auth/google/disconnect', { method: 'POST' });
    window.location.href = '/admin/setup';
  }

  return (
    <div className="admin-shell page">
      <Head>
        <title>Connect Drive - Moment Share</title>
      </Head>
      <div className="container" style={{ paddingTop: 64 }}>
        <Link href="/admin" className="muted" style={{ textDecoration: 'none' }}>
          &larr; Back to dashboard
        </Link>
        <h1 className="display" style={{ fontSize: 26, marginTop: 16, marginBottom: 16 }}>
          Google Drive
        </h1>

        {error && error !== 'not_configured' && (
          <p className="notice-dark">Google said: {error}. Try again, and choose the account you want.</p>
        )}

        {!configured ? (
          <div className="card">
            <strong>Not set up yet</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              The Google sign-in keys aren't in Vercel yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
              GOOGLE_REDIRECT_URI). Create them in Google Cloud while signed in to the account the photos
              should go to, add them in Vercel, and this page will offer to connect.
            </p>
          </div>
        ) : connected ? (
          <div className="card">
            <strong>{justConnected ? 'Connected' : 'Connected'}{email ? ` as ${email}` : ''}</strong>
            <p className="muted">
              Guest photos are archived automatically into a Drive folder per event in this account.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/api/auth/google" className="btn btn-primary">Switch to a different account</a>
              <button className="btn btn-secondary" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}>
              Switching accounts starts new event folders in the new account; photos already copied stay
              where they are.
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="muted">
              Authorize this app to create folders and upload files in your Google Drive. Google will ask
              which account to use. It can only see the folders and files it creates, nothing else in
              your Drive.
            </p>
            <a href="/api/auth/google" className="btn btn-primary">
              Connect Google Drive
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
