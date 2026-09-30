// Server-only wrapper around fal.ai. The FAL_KEY never reaches the browser.
import { fal } from '@fal-ai/client';
import { DEFAULT_MODEL, SYSTEM_PROMPT } from './presets';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is not set. Add it in Vercel → Settings → Environment Variables.');
  }
  fal.config({ credentials: process.env.FAL_KEY });
  configured = true;
}

export function isAiConfigured() {
  return Boolean(process.env.FAL_KEY);
}

// Our own hard stop, well under the route's 90s limit, so a slow queue ends
// in a clean error (and a refunded edit) instead of Vercel killing the request.
const EDIT_TIMEOUT_MS = 70_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI edit timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// imageUrls: public URLs (or data URIs). Image 1 is always the guest's photo.
// Returns { url, width, height, contentType }.
export async function runEdit({ prompt, imageUrls, model }) {
  ensureConfigured();
  const request = fal.subscribe(model || process.env.FAL_MODEL || DEFAULT_MODEL, {
    // Give up if the job hasn't started within 30s (busy queue).
    startTimeout: 30,
    timeout: EDIT_TIMEOUT_MS,
    input: {
      prompt,
      system_prompt: SYSTEM_PROMPT,
      image_urls: imageUrls,
      num_images: 1,
      aspect_ratio: 'auto',
      output_format: 'jpeg',
      resolution: process.env.FAL_RESOLUTION || '1K',
      // 1 is strictest, 6 most permissive. 2 keeps a family event family-friendly.
      safety_tolerance: '2',
    },
  });
  const result = await withTimeout(request, EDIT_TIMEOUT_MS);

  const image = result?.data?.images?.[0];
  if (!image?.url) {
    throw new Error('The AI returned no image (it may have been blocked by the safety filter).');
  }
  return {
    url: image.url,
    width: image.width || null,
    height: image.height || null,
    contentType: image.content_type || 'image/jpeg',
  };
}
