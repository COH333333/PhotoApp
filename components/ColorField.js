import { useEffect, useState } from 'react';

// A colour picker that works the same on every phone: a row of ready-made
// swatches, the system picker for anything else, and a hex box for exact
// brand colours.
const SWATCHES = [
  '#1f6f63', '#2f5d50', '#1e3a5f', '#4f7c8a', '#7a3e9d', '#8a4b2c',
  '#b23a48', '#c97b84', '#e2a73b', '#d4af37', '#f0b7a4', '#2b2d42',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function ColorField({ id, label, value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  function commit(v) {
    const next = v.startsWith('#') ? v : `#${v}`;
    if (HEX.test(next)) onChange(next.toLowerCase());
  }

  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-row">
        <label className="color-current" style={{ background: value }} title="Pick any colour">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onInput={(e) => onChange(e.target.value)}
            aria-label={`${label}: pick any colour`}
          />
        </label>
        <input
          id={id}
          className="color-hex"
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value.trim());
          }}
          spellCheck={false}
          autoCapitalize="off"
        />
      </div>
      <div className="color-swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch${c === value.toLowerCase() ? ' is-active' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}
