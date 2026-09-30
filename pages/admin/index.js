import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { isAdminRequest } from '../../lib/auth';
import { listEvents } from '../../lib/store';
import { isDriveConnected } from '../../lib/drive';

export async function getServerSideProps({ req }) {
  if (!isAdminRequest(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  const events = await listEvents();
  const driveConnected = await isDriveConnected();
  return { props: { events, driveConnected } };
}

export default function AdminDashboard({ events, driveConnected }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState(events);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date }),
    });
    setCreating(false);
    if (res.ok) {
      const data = await res.json();
      setList([data.event, ...list]);
      setName('');
      setDate('');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not create event');
    }
  }

  return (
    <div className="admin-shell page">
      <Head>
        <title>Host dashboard - Moment Share</title>
      </Head>
      <div className="wide-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 32,
          }}
        >
          <div>
            <p className="eyebrow" style={{ color: '#e2a73b' }}>
              Moment Share
            </p>
            <h1 className="display" style={{ fontSize: 28 }}>
              Your events
            </h1>
          </div>
          <form action="/api/admin/logout" method="POST">
            <button
              className="btn btn-secondary"
              formAction="/api/admin/logout"
              onClick={async (e) => {
                e.preventDefault();
                await fetch('/api/admin/logout', { method: 'POST' });
                window.location.href = '/admin/login';
              }}
            >
              Sign out
            </button>
          </form>
        </div>

        {!driveConnected && (
          <div
            className="card"
            style={{ marginBottom: 24, borderColor: '#e2a73b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}
          >
            <div>
              <strong>Google Drive isn't connected yet.</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Photos will still upload to the live gallery, but won't be archived to Drive until you connect it.
              </p>
            </div>
            <Link href="/admin/setup" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Connect Drive
            </Link>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 24 }}>
          <form onSubmit={handleCreate} className="card" style={{ height: 'fit-content' }}>
            <h2 className="display" style={{ fontSize: 18, marginTop: 0 }}>
              New event
            </h2>
            <div className="field">
              <label htmlFor="name">Event name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Trung & Wendy's Wedding"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {error && <p style={{ color: '#e2a73b', fontSize: 14 }}>{error}</p>}
            <button className="btn btn-primary btn-block" disabled={creating}>
              {creating ? 'Creating…' : 'Create event'}
            </button>
          </form>

          <div>
            {list.length === 0 && (
              <div className="card">
                <p className="muted" style={{ margin: 0 }}>
                  No events yet. Create your first one to get a QR code and a live gallery.
                </p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {list.map((ev) => (
                <Link
                  key={ev.slug}
                  href={`/admin/events/${ev.slug}`}
                  className="card"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}
                >
                  <div>
                    <div className="display" style={{ fontSize: 18 }}>
                      {ev.name}
                    </div>
                    <div className="muted">{ev.date || 'No date set'}</div>
                  </div>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: ev.primaryColor,
                      flexShrink: 0,
                    }}
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
