import { useEffect, useState } from 'react';

// The host's photo challenges. Tapping one tags the next photo with it.
// Completed ones are remembered on this phone only (no account needed).
export function useCompleted(slug) {
  const key = `ms_done_${slug}`;
  const [done, setDone] = useState([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch {
      setDone([]);
    }
  }, [key]);
  function markDone(id) {
    setDone((cur) => {
      const next = cur.includes(id) ? cur : [...cur, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // private mode; the checkmarks just won't stick
      }
      return next;
    });
  }
  return [done, markDone];
}

export default function ChallengeChips({ challenges, selected, onSelect, done = [], compact = false }) {
  if (!challenges || challenges.length === 0) return null;
  return (
    <section style={{ marginTop: compact ? 0 : 28 }}>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="display" style={{ fontSize: 17, margin: 0 }}>Photo challenges</h2>
          <span className="muted" style={{ fontSize: 13 }}>{done.length}/{challenges.length} done</span>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: compact ? 0 : 6 }}>
        {compact ? 'Tag this photo with a challenge (optional):' : 'Tap one, then take the photo.'}
      </p>
      <div className="challenge-list">
        {challenges.map((c) => {
          const isSel = selected === c.id;
          const isDone = done.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`challenge-chip${isSel ? ' is-selected' : ''}${isDone ? ' is-done' : ''}`}
              onClick={() => onSelect(isSel ? null : c.id)}
              aria-pressed={isSel}
            >
              <span className="challenge-mark" aria-hidden="true">{isDone ? '✓' : isSel ? '●' : '○'}</span>
              <span>{c.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
