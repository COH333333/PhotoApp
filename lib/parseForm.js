import formidable from 'formidable';
import fs from 'fs/promises';

// The browser always re-encodes photos to JPEG before upload (lib/heicConvert),
// so anything else is refused. This stops the app's public storage from being
// used to host arbitrary files.
const MAX_FILE_BYTES = 6 * 1024 * 1024;

function isJpeg(buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Parses a multipart/form-data request and returns { fields, files } where
// each file is { filename, mimeType: 'image/jpeg', buffer }.
export async function parseMultipart(req) {
  const form = formidable({ maxFileSize: MAX_FILE_BYTES });
  let fields;
  let rawFiles;
  try {
    [fields, rawFiles] = await form.parse(req);
  } catch (err) {
    throw new UploadError('That upload was too large or incomplete. Try again.');
  }

  const files = {};
  for (const [key, arr] of Object.entries(rawFiles)) {
    const file = Array.isArray(arr) ? arr[0] : arr;
    if (!file) continue;
    const buffer = await fs.readFile(file.filepath);
    await fs.unlink(file.filepath).catch(() => {});
    if (!isJpeg(buffer)) throw new UploadError('Only photos can be uploaded.');
    files[key] = { filename: file.originalFilename || 'upload.jpg', mimeType: 'image/jpeg', buffer };
  }

  const flatFields = {};
  for (const [key, arr] of Object.entries(fields)) {
    flatFields[key] = Array.isArray(arr) ? arr[0] : arr;
  }

  return { fields: flatFields, files };
}
