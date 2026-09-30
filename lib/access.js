// Who may open an event.
//
// Every event has a secret access key. It travels inside the QR code and the
// album link (`/e/<slug>?k=<key>`); opening such a link once sets a cookie for
// that event, and every page and API for the event checks the cookie. Guests
// never type anything. Someone who only knows the slug sees a locked page.
//
// The cookie holds an HMAC of the key rather than the key itself, so a cookie
// can't be turned back into a shareable link, and regenerating the event's key
// invalidates every cookie at once.
import { createHmac, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';

const COOKIE_PREFIX = 'ms_ev_';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function newAccessKey() {
  return nanoid(14);
}

function proof(accessKey) {
  return createHmac('sha256', process.env.JWT_SECRET || 'dev').update(accessKey).digest('hex').slice(0, 40);
}

function cookieName(slug) {
  // Slugs are already [a-z0-9-], which is cookie-safe.
  return `${COOKIE_PREFIX}${slug}`;
}

// Adds a Set-Cookie header without clobbering ones already queued (the guest
// id cookie is issued on the same response).
export function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function keyMatches(event, key) {
  if (!event?.accessKey || typeof key !== 'string') return false;
  const a = Buffer.from(event.accessKey);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasAccess(req, event) {
  if (!event?.accessKey) return false;
  const value = req.cookies?.[cookieName(event.slug)];
  if (!value) return false;
  const expected = proof(event.accessKey);
  const a = Buffer.from(String(value));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function grantAccess(res, event) {
  appendSetCookie(
    res,
    `${cookieName(event.slug)}=${proof(event.accessKey)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
}

// The links the host hands out. Both carry the key.
export function guestLink(origin, event) {
  return `${origin}/e/${event.slug}?k=${event.accessKey}`;
}

export function albumLink(origin, event) {
  return `${origin}/e/${event.slug}/gallery?k=${event.accessKey}`;
}

export function wallLink(origin, event) {
  return `${origin}/e/${event.slug}/wall?k=${event.accessKey}`;
}

// For getServerSideProps on guest-facing pages. Returns one of:
//   { redirect }        the link carried a valid key; cookie set, key stripped
//   { locked: true }    no access; render the locked page
//   { ok: true }        carry on
export function guardEventPage({ req, res, query, resolvedUrl }, event) {
  const key = typeof query.k === 'string' ? query.k : null;
  if (key !== null) {
    if (keyMatches(event, key)) {
      grantAccess(res, event);
      const clean = resolvedUrl.split('?')[0];
      return { redirect: { destination: clean, permanent: false } };
    }
    // A wrong key is treated like no key: fall through to the cookie check.
  }
  if (hasAccess(req, event)) return { ok: true };
  return { locked: true };
}

// For API routes. Sends a 403 and returns false when the caller lacks access.
export function requireAccess(req, res, event) {
  if (hasAccess(req, event)) return true;
  res.status(403).json({ error: 'Scan the event QR code to open this album.', locked: true });
  return false;
}
