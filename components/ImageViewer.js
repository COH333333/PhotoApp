import { useEffect, useRef, useState } from 'react';

// Full-screen viewer for a set of images: arrows, arrow keys, or swipe to
// move between them; Esc or tapping the dark area to close.
//
// items: [{ url, title, subtitle?, original? }] (an item's own original wins)
// original: optional URL of the photo the images were made from; when set,
//           a "Compare with original" toggle appears.
export default function ImageViewer({ items, startIndex = 0, original = null, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [showOriginal, setShowOriginal] = useState(false);
  const touch = useRef(null);
  const item = items[index];
  const source = item?.original || original;

  function go(dir) {
    setShowOriginal(false);
    setIndex((i) => Math.min(items.length - 1, Math.max(0, i + dir)));
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // Keep the page behind from scrolling while the viewer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (!item) return null;

  return (
    <div
      className="lightbox"
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY, at: Date.now() };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - start.at < 800) {
          go(dx < 0 ? 1 : -1);
        }
      }}
      role="dialog"
      aria-label="Image viewer"
    >
      <span className="lightbox-count">{index + 1} / {items.length}</span>
      <button
        className="lightbox-close"
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ×
      </button>
      {index > 0 && (
        <button className="lightbox-arrow is-left viewer-arrow" aria-label="Previous" onClick={(e) => { e.stopPropagation(); go(-1); }}>
          ‹
        </button>
      )}
      {index < items.length - 1 && (
        <button className="lightbox-arrow is-right viewer-arrow" aria-label="Next" onClick={(e) => { e.stopPropagation(); go(1); }}>
          ›
        </button>
      )}

      <img
        key={`${index}-${showOriginal}`}
        src={showOriginal && source ? source : item.url}
        alt={item.title}
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="viewer-caption" onClick={(e) => e.stopPropagation()}>
        <strong>{showOriginal ? 'Original photo' : item.title}</strong>
        {!showOriginal && item.subtitle && <span>{item.subtitle}</span>}
      </div>
      {source && item.url !== source && (
        <button
          className="btn btn-secondary"
          style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
          onClick={(e) => { e.stopPropagation(); setShowOriginal((v) => !v); }}
        >
          {showOriginal ? `Show ${item.title}` : 'Compare with original'}
        </button>
      )}
    </div>
  );
}
