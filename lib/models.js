// The AI models a style can run on. Safe to import in the browser: names
// and prices only, no prompts or keys.
//
// Full: Google's Nano Banana 2. Best at keeping faces exactly right.
// Lite: Google's Nano Banana 2 Lite (June 2026). Same family, about 40% of
//       the price and faster, a little weaker on complex edits. Output is
//       capped at 1K and it has no resolution setting.

export const MODELS = {
  full: {
    label: 'Full',
    name: 'Nano Banana 2',
    endpoint: 'fal-ai/nano-banana-2/edit',
    cost: 0.08,
    supportsResolution: true,
  },
  lite: {
    label: 'Lite',
    name: 'Nano Banana 2 Lite',
    endpoint: 'google/nano-banana-lite/edit',
    cost: 0.034,
    supportsResolution: false,
  },
};

export const TIERS = Object.keys(MODELS);

export function isTier(t) {
  return Object.prototype.hasOwnProperty.call(MODELS, t);
}
