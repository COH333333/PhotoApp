// Server-only wrapper around fal.ai. The FAL_KEY never reaches the browser.
import { fal } from '@fal-ai/client';
import { DEFAULT_MODEL, SYSTEM_PROMPT } from './presets';
import { MODELS } from './models';

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
// tier: 'full' or 'lite' (see lib/models.js). An explicit `model` endpoint
// overrides it.
// Returns { url, width, height, contentType }.
export async function runEdit({ prompt, imageUrls, model, tier = 'full', resolution, timeoutMs }) {
  ensureConfigured();
  const budget = timeoutMs || EDIT_TIMEOUT_MS;
  const spec = MODELS[tier] || MODELS.full;
  const endpoint = model || (tier === 'full' ? process.env.FAL_MODEL || DEFAULT_MODEL : spec.endpoint);

  const input = {
    prompt,
    system_prompt: SYSTEM_PROMPT,
    image_urls: imageUrls,
    num_images: 1,
    aspect_ratio: 'auto',
    output_format: 'jpeg',
    // 1 is strictest, 6 most permissive. 2 keeps a family event family-friendly.
    safety_tolerance: '2',
  };
  if (spec.supportsResolution) {
    input.resolution = resolution || process.env.FAL_RESOLUTION || '1K';
  }

  async function call(body) {
    return withTimeout(
      fal.subscribe(endpoint, {
        // Give up if the job hasn't started within 30s (busy queue).
        startTimeout: 30,
        timeout: budget,
        input: body,
      }),
      budget
    );
  }

  let request;
  try {
    request = await call(input);
  } catch (err) {
    // If the Lite endpoint rejects one of the optional settings, retry once
    // with just the essentials rather than failing the guest's edit.
    const status = err?.status || err?.response?.status;
    if (tier === 'lite' && status === 422) {
      console.error('Lite rejected optional input, retrying minimal:', JSON.stringify(err?.body || '').slice(0, 300));
      // Fold the standing rules (keep faces, add nobody) into the prompt so
      // they aren't lost along with the optional fields.
      request = await call({
        prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
        image_urls: imageUrls,
        num_images: 1,
        aspect_ratio: 'auto',
      });
    } else {
      throw err;
    }
  }
  const result = request;

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
