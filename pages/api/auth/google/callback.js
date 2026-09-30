import { isAdminRequest } from '../../../../lib/auth';
import { exchangeCodeForTokens } from '../../../../lib/drive';

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).send('Not signed in as admin.');

  const { code, error } = req.query;
  if (error) {
    return res.redirect(`/admin/setup?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect('/admin/setup?error=missing_code');
  }

  try {
    await exchangeCodeForTokens(code);
    return res.redirect('/admin/setup?connected=1');
  } catch (err) {
    console.error('Google token exchange failed:', err.message);
    return res.redirect(`/admin/setup?error=${encodeURIComponent(err.message)}`);
  }
}
