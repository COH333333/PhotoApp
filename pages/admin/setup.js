import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { isDriveConnected } from '../../lib/drive';

export async function getServerSideProps({ req }) {
  if (!isAdminRequest(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  const connected = await isDriveConnected();
  return { props: { connected } };
}

export default function AdminSetup({ connected }) {
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

        {connected ? (
          <div className="card">
            <strong>Connected</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              Guest photos are archived automatically into a Drive folder per event.
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="muted">
              Authorize this app to create folders and upload files in your Google Drive. This is a
              one-time step — done once, every event's photos land in your Drive automatically.
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
