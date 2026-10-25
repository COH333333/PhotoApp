// Wraps googleapis so the rest of the app never touches OAuth details.
// Tokens are obtained once via the /api/auth/google flow (run from the
// admin dashboard) and stored in KV; every call here refreshes silently
// using the stored refresh token.
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleTokens, setGoogleTokens, getDriveRoot, setDriveRoot } from './store';

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

// True when the Google sign-in keys are set in Vercel.
export function isDriveConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    // Always show Google's account chooser, so the host can pick which
    // Google account the photos go to rather than whichever is signed in.
    prompt: 'consent select_account',
    // drive.file only reaches files and folders this app creates.
    // openid + email let the dashboard show which account is connected.
    scope: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'],
  });
}

// The email inside Google's ID token. It comes straight from Google's token
// endpoint over HTTPS, so reading it without re-verifying is fine for display.
function emailFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return payload.email || null;
  } catch {
    return null;
  }
}

export async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  const email = emailFromIdToken(tokens.id_token);
  const previous = await getGoogleTokens();
  await setGoogleTokens({ ...tokens, email });
  return { email, previousEmail: previous?.email || null, hadPrevious: Boolean(previous) };
}

export async function getConnectedEmail() {
  const tokens = await getGoogleTokens();
  return tokens?.email || null;
}

async function getDriveClient() {
  const tokens = await getGoogleTokens();
  if (!tokens) {
    throw new Error('Google Drive is not connected yet. Visit /admin/setup.');
  }
  const client = getOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', async (newTokens) => {
    // Refresh tokens rotate the access token; keep the refresh token if a
    // new one wasn't issued.
    await setGoogleTokens({ ...tokens, ...newTokens });
  });
  return google.drive({ version: 'v3', auth: client });
}

export async function isDriveConnected() {
  const tokens = await getGoogleTokens();
  return Boolean(tokens);
}

export function folderUrl(id) {
  return `https://drive.google.com/drive/folders/${id}`;
}

// --- Main folder ---------------------------------------------------------
// The app's Drive permission (drive.file) only reaches folders and files the
// app itself created, so the main folder is made by the app. The host can
// rename it or move it anywhere in their Drive afterwards; the id stays.

export const DEFAULT_ROOT_NAME = 'Moment Share';

// Returns the main folder, creating it if there isn't one (or if the one on
// record was deleted from Drive).
export async function ensureRootFolder(name) {
  const drive = await getDriveClient();
  const existing = await getDriveRoot();
  if (existing?.id) {
    try {
      const res = await drive.files.get({ fileId: existing.id, fields: 'id, name, trashed' });
      if (!res.data.trashed) {
        const current = { ...existing, name: res.data.name, url: folderUrl(existing.id) };
        if (current.name !== existing.name) await setDriveRoot(current);
        return current;
      }
    } catch (err) {
      if (err?.code !== 404 && err?.response?.status !== 404) throw err;
    }
  }
  const res = await drive.files.create({
    requestBody: { name: name || existing?.name || DEFAULT_ROOT_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id, name',
  });
  const root = {
    id: res.data.id,
    name: res.data.name,
    url: folderUrl(res.data.id),
    account: (await getGoogleTokens())?.email || null,
  };
  await setDriveRoot(root);
  return root;
}

export async function renameRootFolder(name) {
  const drive = await getDriveClient();
  const root = await ensureRootFolder(name);
  if (root.name === name) return root;
  await drive.files.update({ fileId: root.id, requestBody: { name } });
  const next = { ...root, name };
  await setDriveRoot(next);
  return next;
}

// --- Event folders -------------------------------------------------------

export function eventFolderName(event) {
  if (!event.date) return event.name;
  return `${event.date} · ${event.name}`;
}

// Creates a folder for one event inside the main folder. Returns { id, url }.
export async function createEventFolder(event) {
  const drive = await getDriveClient();
  const root = await ensureRootFolder();
  const res = await drive.files.create({
    requestBody: {
      name: eventFolderName(event),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [root.id],
    },
    fields: 'id',
  });
  return { id: res.data.id, url: folderUrl(res.data.id) };
}

// Is the folder still there (not deleted or trashed in Drive)?
export async function folderExists(id) {
  const drive = await getDriveClient();
  try {
    const res = await drive.files.get({ fileId: id, fields: 'id, trashed' });
    return !res.data.trashed;
  } catch (err) {
    if (err?.code === 404 || err?.response?.status === 404) return false;
    throw err;
  }
}

// View-only link sharing: anyone with the link can see and download, but
// nobody can edit, and the folder doesn't turn up in searches.
export async function setFolderLinkSharing(id, on) {
  const drive = await getDriveClient();
  const { data } = await drive.permissions.list({ fileId: id, fields: 'permissions(id, type, role)' });
  const anyone = (data.permissions || []).filter((p) => p.type === 'anyone');
  if (on && !anyone.some((p) => p.role === 'reader')) {
    await drive.permissions.create({
      fileId: id,
      requestBody: { type: 'anyone', role: 'reader', allowFileDiscovery: false },
    });
  }
  if (!on) {
    await Promise.all(anyone.map((p) => drive.permissions.delete({ fileId: id, permissionId: p.id })));
  }
}

// Uploads a single photo buffer into an event's Drive folder.
export async function uploadPhotoToDrive({ folderId, filename, mimeType, buffer }) {
  const drive = await getDriveClient();

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
  });

  // Files inherit the event folder's sharing: view-only to anyone with the
  // folder link when the host has sharing on, private otherwise.
  return res.data;
}

export async function renameDriveFile(id, name) {
  const drive = await getDriveClient();
  await drive.files.update({ fileId: id, requestBody: { name } });
}

// Moves files to Drive's trash (recoverable there for 30 days).
export async function trashDriveFiles(ids) {
  const drive = await getDriveClient();
  await Promise.all(
    ids.filter(Boolean).map((fileId) =>
      drive.files.update({ fileId, requestBody: { trashed: true } }).catch((err) => {
        if (err?.code !== 404 && err?.response?.status !== 404) throw err;
      })
    )
  );
}
