// Wraps googleapis so the rest of the app never touches OAuth details.
// Tokens are obtained once via the /api/auth/google flow (run from the
// admin dashboard) and stored in KV; every call here refreshes silently
// using the stored refresh token.
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleTokens, setGoogleTokens } from './store';

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  await setGoogleTokens(tokens);
  return tokens;
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

// Creates (or reuses) a Drive folder for one event, nested under the
// configured root folder.
export async function ensureEventFolder(eventName, existingFolderId) {
  const drive = await getDriveClient();
  if (existingFolderId) return existingFolderId;

  const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
  const res = await drive.files.create({
    requestBody: {
      name: eventName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: rootId ? [rootId] : undefined,
    },
    fields: 'id',
  });
  return res.data.id;
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

  // Files stay private to your Drive. The live gallery serves its own copies,
  // so nothing here needs to be shared publicly.
  return res.data;
}
