import { useCallback, useEffect, useRef, useState } from 'react';

// Full-screen viewer for a set of images.
//
//   Move between images: the side arrows and arrow keys (always, at any
//   zoom), or swipe when not zoomed (when zoomed, dragging looks around).
//   Zoom: pinch, double-tap / double-click, mouse wheel, the + / − buttons,
//         or the + / − / 0 keys. Drag to look around while zoomed.
//   Close: ×, Esc, or tapping the dark area.
//
// items: [{ url, title, subtitle?, original? }] (an item's own original wins)
// original: optional URL of the photo the images were made from; when set,
//           a "Compare with original" toggle appears.

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 1.6;

export default function ImageViewer({ items, startIndex = 0, original = null, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [showOriginal, setShowOriginal] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const swipe = useRef(null);
  const item = items[index];
  const source = item?.original || original;
  const zoomed = view.scale > 1.01;

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  function go(dir) {
    setShowOriginal(false);
    reset();
    setIndex((i) => Math.min(items.length - 1, Math.max(0, i + dir)));
  }

  // Keeps the image from being dragged out of sight.
  // The photo is drawn "contain" inside a screen-sized box, so its visible
  // size is the box scaled to the photo's shape.
  function drawnSize(img) {
    const bw = img.offsetWidth;
    const bh = img.offsetHeight;
    const nw = img.naturalWidth || bw;
    const nh = img.naturalHeight || bh;
    const fit = Math.min(bw / nw, bh / nh);
    return { w: nw * fit, h: nh * fit, bw, bh };
  }

  function clamp(next) {
    const img = imgRef.current;
    if (!img) return next;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const { w, h, bw, bh } = drawnSize(img);
    // Allow panning until the photo's edge meets the box edge.
    const maxX = Math.max(0, (w * scale - bw) / 2);
    const maxY = Math.max(0, (h * scale - bh) / 2);
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  // Zooms so the point under (clientX, clientY) stays where it is.
  function zoomAt(newScale, clientX, clientY) {
    const img = imgRef.current;
    if (!img) return;
    setView((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
      if (s === 1) return { scale: 1, x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      // Point relative to the image's untransformed centre.
      const cx = rect.left + rect.width / 2 - v.x;
      const cy = rect.top + rect.height / 2 - v.y;
      const px = (clientX ?? cx) - cx;
      const py = (clientY ?? cy) - cy;
      const ratio = s / v.scale;
      return clamp({ scale: s, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio });
    });
  }

  function zoomBy(factor) {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    zoomAt(view.scale * factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') (zoomed ? reset() : onClose());
      else if (e.key === '+' || e.key === '=') zoomBy(STEP);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
      else if (e.key === '0') reset();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0025);
      setView((v) => {
        const img = imgRef.current;
        if (!img) return v;
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        if (s === 1) return { scale: 1, x: 0, y: 0 };
        const rect = img.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - v.x;
        const cy = rect.top + rect.height / 2 - v.y;
        const px = e.clientX - cx;
        const py = e.clientY - cy;
        const ratio = s / v.scale;
        return clamp({ scale: s, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio });
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // --- Pointer handling: drag to pan, pinch to zoom, double-tap, swipe ---
  function onPointerDown(e) {
    e.stopPropagation();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        start: view,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      swipe.current = null;
      return;
    }

    gesture.current = { type: 'pan', from: { x: e.clientX, y: e.clientY }, start: view, moved: false };
    swipe.current = zoomed ? null : { x: e.clientX, y: e.clientY, at: Date.now() };
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const img = imgRef.current;
      if (!img || !g.dist) return;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.start.scale * (dist / g.dist)));
      const rect = img.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - view.x;
      const cy = rect.top + rect.height / 2 - view.y;
      const px = g.mid.x - cx;
      const py = g.mid.y - cy;
      const ratio = s / g.start.scale;
      setView(s === 1 ? { scale: 1, x: 0, y: 0 } : clamp({ scale: s, x: px - (px - g.start.x) * ratio, y: py - (py - g.start.y) * ratio }));
      return;
    }

    if (g.type === 'pan') {
      const dx = e.clientX - g.from.x;
      const dy = e.clientY - g.from.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      if (g.start.scale > 1.01) setView(clamp({ scale: g.start.scale, x: g.start.x + dx, y: g.start.y + dy }));
    }
  }

  function onPointerUp(e) {
    e.stopPropagation();
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    // Finished a pinch with one finger still down: carry on as a pan.
    if (g?.type === 'pinch') {
      if (pointers.current.size === 1) {
        const [p] = [...pointers.current.values()];
        gesture.current = { type: 'pan', from: p, start: view, moved: true };
      } else {
        gesture.current = null;
      }
      return;
    }
    gesture.current = null;

    // Swipe to the next/previous image, only when not zoomed.
    const s = swipe.current;
    swipe.current = null;
    if (s && !zoomed) {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.at < 800) {
        go(dx < 0 ? 1 : -1);
        return;
      }
    }

    // Double-tap / double-click toggles zoom at that point.
    if (!g?.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (zoomed) reset();
        else zoomAt(2.5, e.clientX, e.clientY);
      } else {
        lastTap.current = now;
      }
    }
  }

  if (!item) return null;

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image viewer">
      <span className="lightbox-count">{index + 1} / {items.length}</span>
      <button className="lightbox-close" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
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

      <div
        ref={stageRef}
        className={`viewer-stage${zoomed ? ' is-zoomed' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          key={`${index}-${showOriginal}`}
          src={showOriginal && source ? source : item.url}
          alt={item.title}
          className="lightbox-img"
          draggable={false}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: gesture.current ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>

      <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-controls">
          <button aria-label="Zoom out" onClick={() => zoomBy(1 / STEP)} disabled={!zoomed}>−</button>
          <button className="viewer-zoom-level" onClick={reset} disabled={!zoomed} aria-label="Reset zoom">
            {Math.round(view.scale * 100)}%
          </button>
          <button aria-label="Zoom in" onClick={() => zoomBy(STEP)} disabled={view.scale >= MAX_SCALE}>+</button>
        </div>
        <div className="viewer-caption">
          <strong>{showOriginal ? 'Original photo' : item.title}</strong>
          {!showOriginal && item.subtitle && <span>{item.subtitle}</span>}
        </div>
        {source && item.url !== source ? (
          <button
            className="btn btn-secondary viewer-compare"
            onClick={() => setShowOriginal((v) => !v)}
          >
            {showOriginal ? `Show ${item.title}` : 'Compare with original'}
          </button>
        ) : (
          <span className="viewer-compare-spacer" />
        )}
      </div>
    </div>
  );
}
