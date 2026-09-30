import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'moment_admin';

export function createAdminCookie() {
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export function clearAdminCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`;
}

export function isAdminRequest(req) {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (!cookie) return false;
  try {
    jwt.verify(cookie, process.env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}
