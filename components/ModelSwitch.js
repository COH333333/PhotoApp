import { MODELS } from '../lib/models';

// A Lite | Full toggle for which AI model makes an image.
export default function ModelSwitch({ value, onChange, disabled, compact = false }) {
  return (
    <span className={`model-switch${compact ? ' is-compact' : ''}`} role="group" aria-label="AI model">
      {Object.entries(MODELS).map(([tier, m]) => (
        <button
          key={tier}
          type="button"
          className={value === tier ? 'is-on' : ''}
          aria-pressed={value === tier}
          disabled={disabled}
          title={`${m.name} · about $${m.cost.toFixed(3).replace(/0$/, '')} an edit`}
          onClick={() => value !== tier && onChange(tier)}
        >
          {m.label}
        </button>
      ))}
    </span>
  );
}
