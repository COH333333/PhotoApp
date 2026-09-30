// When an event accepts uploads.
//
// By default uploads stay open until 7 days after the event date, so late
// photos from the weekend still make it in, then close on their own. The
// album stays viewable after that. The host can force uploads open or closed
// at any time from the dashboard.

const GRACE_DAYS = 7;

export const UPLOAD_MODES = ['auto', 'open', 'closed'];

// Returns the moment uploads close automatically, or null for "never".
export function autoCloseAt(event) {
  if (!event?.date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  // Start of the day after the grace period, in UTC. Wherever the event is,
  // that's at least 7 full days after the event day ends.
  return new Date(Date.UTC(y, mo - 1, d + GRACE_DAYS + 1));
}

export function uploadsState(event, now = new Date()) {
  const mode = UPLOAD_MODES.includes(event?.uploadsMode) ? event.uploadsMode : 'auto';
  if (mode === 'open') return { open: true, mode, closesAt: null };
  if (mode === 'closed') return { open: false, mode, closesAt: null };
  const closesAt = autoCloseAt(event);
  return { open: !closesAt || now < closesAt, mode, closesAt: closesAt ? closesAt.toISOString() : null };
}

export function uploadsOpen(event) {
  return uploadsState(event).open;
}
