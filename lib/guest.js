// Anonymous, per-browser guest id. Only used to enforce the per-guest AI edit
// limit. It identifies a browser, not a person, and stores nothing else.
import { nanoid } from 'nanoid';
import { appendSetCookie } from './access';

const COOKIE = 'ms_guest';

export function readGuestId(req) {
  const id = req.cookies?.[COOKIE];
  return id && /^[A-Za-z0-9_-]{8,32}$/.test(id) ? id : null;
}

export function getOrCreateGuestId(req, res) {
  const existing = readGuestId(req);
  if (existing) return existing;
  const id = nanoid(16);
  appendSetCookie(
    res,
    `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  return id;
}
