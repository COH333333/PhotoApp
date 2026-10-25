import { isAdminRequest } from '../../../../lib/auth';
import { exchangeCodeForTokens, ensureRootFolder } from '../../../../lib/drive';
import { listEvents, updateEvent, getDriveRoot, setDriveRoot } from '../../../../lib/store';

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
    const { email, previousEmail, hadPrevious } = await exchangeCodeForTokens(code);
    // A different Google account can't see the old account's folders, so
    // forget them; each event gets a new folder in the new account on its
    // next photo.
    // A different account than the folders were made in (whether switching
    // directly, or reconnecting after Disconnect) can't reach them.
    const root = await getDriveRoot();
    const switched =
      (hadPrevious && email !== previousEmail) || Boolean(root?.account && email && root.account !== email);
    const rootName = root?.name;
    if (switched) {
      const events = await listEvents();
      await Promise.all(
        events
          .filter((e) => e.driveFolderId)
          .map((e) => updateEvent(e.slug, { driveFolderId: null, driveFolderUrl: null }))
      );
      await setDriveRoot(null);
    }
    // The main folder every event folder goes into, in this account.
    await ensureRootFolder(rootName);
    return res.redirect('/admin/setup?connected=1');
  } catch (err) {
    console.error('Google token exchange failed:', err.message);
    return res.redirect(`/admin/setup?error=${encodeURIComponent(err.message)}`);
  }
}
