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
