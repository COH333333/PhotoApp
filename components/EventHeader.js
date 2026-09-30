import Link from 'next/link';

// Top of every guest page: cover photo (if the host added one), the event
// name, and the one link that takes you to the other half of the app.
export default function EventHeader({ event, linkHref, linkLabel, showWelcome = false }) {
  return (
    <header style={{ marginBottom: 20 }}>
      {event.coverUrl && (
        <div className="cover">
          <img src={event.coverUrl} alt="" />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h1 className="display" style={{ fontSize: 22, margin: 0 }}>{event.name}</h1>
        {linkHref && (
          <Link href={linkHref} className="muted" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {linkLabel}
          </Link>
        )}
      </div>
      {showWelcome && event.welcome && (
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>{event.welcome}</p>
      )}
    </header>
  );
}
