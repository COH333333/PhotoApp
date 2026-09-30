import { useState } from 'react';

export default function PhotoGallery({ photos }) {
  const [active, setActive] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  if (!photos || photos.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ margin: 0 }}>No photos yet. Be the first to add one.</p>
      </div>
    );
  }

  function open(p) {
    setShowOriginal(false);
    setActive(p);
  }

  return (
    <>
      <div className="gallery-grid">
        {photos.map((p) => (
          <button key={p.id} className="gallery-cell" onClick={() => open(p)}>
            <img src={p.url} alt={p.aiLabel ? `AI edit: ${p.aiLabel}` : 'Guest photo'} loading="lazy" />
            {p.aiLabel && <span className="ai-tag">AI · {p.aiLabel}</span>}
          </button>
        ))}
      </div>

      {active && (
        <div
          onClick={() => setActive(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,24,28,0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            padding: 24,
            zIndex: 50,
          }}
        >
          <img
            src={showOriginal && active.originalUrl ? active.originalUrl : active.url}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 4 }}
          />
          {active.originalUrl && (
            <button
              className="btn btn-secondary"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
              onClick={(e) => {
                e.stopPropagation();
                setShowOriginal((v) => !v);
              }}
            >
              {showOriginal ? `Show ${active.aiLabel} edit` : 'Show original'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
