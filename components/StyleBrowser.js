import { useEffect, useRef, useState } from 'react';

// Full-screen browser for the AI styles: one big example at a time, swipe
// or tap the arrows to move through them, a strip of small examples at the
// bottom to jump around, and one button to use the style on.
//
// styles: [{ id, label, blurb, previewUrl, needsSelfie, needsBackdrop }]
export default function StyleBrowser({ styles, startIndex = 0, photoUrl, remaining, subject, onUse, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [showMine, setShowMine] = useState(false);
  const swipe = useRef(null);
  const stripRef = useRef(null);
  const style = styles[index];

  function go(dir) {
    setShowMine(false);
    setIndex((i) => Math.min(styles.length - 1, Math.max(0, i + dir)));
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
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

  // Keep the current style's thumbnail in view in the strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-i="${index}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  // Warm the next and previous examples so swiping feels instant.
  useEffect(() => {
    [styles[index + 1], styles[index - 1]].forEach((s) => {
      if (s?.previewUrl) {
        const img = new Image();
        img.src = s.previewUrl;
      }
    });
  }, [index, styles]);

  function onPointerDown(e) {
    swipe.current = { x: e.clientX, y: e.clientY, at: Date.now() };
  }
  function onPointerUp(e) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - s.at < 900) go(dx < 0 ? 1 : -1);
  }

  if (!style) return null;
  const extra = style.needsBackdrop
    ? `You'll pick a photo of ${subject} to pose with next.`
    : style.needsSelfie
    ? 'You\'ll take a quick selfie next.'
    : null;

  return (
    <div className="style-browser" role="dialog" aria-label="Choose an AI style">
      <div className="sb-top">
        <span className="sb-count">{index + 1} / {styles.length}</span>
        <button className="sb-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div
        className="sb-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null; }}
      >
        {showMine && photoUrl ? (
          <img src={photoUrl} alt="Your photo" className="sb-img" draggable={false} />
        ) : style.previewUrl ? (
          <img key={style.id} src={style.previewUrl} alt={`${style.label} example`} className="sb-img" draggable={false} />
        ) : (
          <div className="sb-noimg">
            <span className="sb-noimg-label">{style.label}</span>
            <span>{style.blurb}</span>
          </div>
        )}
        {index > 0 && (
          <button className="sb-arrow is-left" onClick={() => go(-1)} aria-label="Previous style">‹</button>
        )}
        {index < styles.length - 1 && (
          <button className="sb-arrow is-right" onClick={() => go(1)} aria-label="Next style">›</button>
        )}
        {photoUrl && style.previewUrl && (
          <button
            className={`sb-mine${showMine ? ' is-on' : ''}`}
            onClick={() => setShowMine((v) => !v)}
            aria-pressed={showMine}
          >
            <img src={photoUrl} alt="" />
            {showMine ? 'Show example' : 'Your photo'}
          </button>
        )}
      </div>

      <div className="sb-info">
        <p className="sb-label">{style.label}</p>
        <p className="sb-blurb">{style.blurb}</p>
        {style.previewUrl && (
          <p className="sb-note">
            Example on one of {subject === 'us' ? 'our' : `${subject}'s`} photos. Yours keeps your own photo.
          </p>
        )}
        {extra && <p className="sb-note">{extra}</p>}
        <button className="btn btn-primary btn-block" onClick={() => onUse(style)} disabled={remaining <= 0}>
          {remaining > 0 ? 'Use this style on my photo' : 'No AI edits left'}
        </button>
      </div>

      <div className="sb-strip" ref={stripRef}>
        {styles.map((s, i) => (
          <button
            key={s.id}
            data-i={i}
            className={`sb-thumb${i === index ? ' is-on' : ''}`}
            onClick={() => { setShowMine(false); setIndex(i); }}
            aria-label={s.label}
            aria-current={i === index}
          >
            {s.previewUrl ? <img src={s.previewUrl} alt="" loading="lazy" /> : <span>{s.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
