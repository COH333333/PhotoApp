import Head from 'next/head';

// Shown when someone reaches an event without having scanned its QR code.
export default function LockedEvent({ event }) {
  return (
    <div className="page" style={{ '--event-primary': event.primaryColor, '--event-accent': event.accentColor }}>
      <Head>
        <title>{`${event.name} - Moment Share`}</title>
      </Head>
      <div className="container" style={{ paddingTop: 96, textAlign: 'center' }}>
        <p className="eyebrow">Private album</p>
        <h1 className="display" style={{ fontSize: 24, marginBottom: 12 }}>{event.name}</h1>
        <p className="muted">
          This album opens from the QR code at the event or the link the host shared.
          Scan the code with your phone's camera to join.
        </p>
      </div>
    </div>
  );
}
