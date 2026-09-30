// Default guardrails for a new event. Hosts can change these per event.
export const AI_DEFAULTS = {
  perGuest: 5,
  perEvent: 400, // at $0.08 per 1K edit, a hard ceiling of about $32 per event
};

export function aiLimitsFor(event) {
  return {
    perGuest: Number(event.aiPerGuest ?? AI_DEFAULTS.perGuest),
    perEvent: Number(event.aiPerEvent ?? AI_DEFAULTS.perEvent),
  };
}

// Video clips. 300 twenty-second clips is 100 minutes: about 50 cents of
// Stream storage, so this is about keeping the album sane, not the bill.
export const VIDEO_DEFAULTS = { perGuest: 15, perEvent: 300 };

export function videoLimitsFor(event) {
  return {
    perGuest: Number(event.videoPerGuest ?? VIDEO_DEFAULTS.perGuest),
    perEvent: Number(event.videoPerEvent ?? VIDEO_DEFAULTS.perEvent),
  };
}
