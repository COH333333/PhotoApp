import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE = 30;
const POLL_MS = 8000;

const SHARE_OPTIONS = [
  { format: 'original', label: 'Original', hint: 'Full size, as posted' },
  { format: 'post', label: 'Post', hint: '4:5 for Instagram or Facebook feed' },
  { format: 'story', label: 'Story', hint: '9:16 for stories and reels' },
];

// Fetches the chosen size and hands it to the phone's share sheet, where the
// guest picks Instagram, Messages, Save to Photos, and so on. Browsers without
// a share sheet (most desktops) get the file as a download instead.
async function shareCopy({ slug, photo, format, setBusy }) {
  const url = `/api/events/${slug}/photos/${photo.id}/share?format=${format}`;
  setBusy(format);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const file = new File([blob], `${slug}-${photo.id}-${format}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err?.name !== 'AbortError') throw err;
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    // Last resort: open the image so it can be long-pressed and saved.
    window.open(`${url}&download=1`, '_blank');
  } finally {
    setBusy(null);
  }
}

// Clips: Stream builds an MP4 in the background; hand that to the share
// sheet, or open it if the browser won't let us fetch it.
async function shareVideo({ photo, setBusy }) {
  if (!photo.downloadUrl) return;
  setBusy('video');
  try {
    const res = await fetch(photo.downloadUrl);
    if (!res.ok) throw new Error('not ready');
    const blob = await res.blob();
    const file = new File([blob], `${photo.id}.mp4`, { type: 'video/mp4' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err?.name !== 'AbortError') throw err;
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(photo.downloadUrl, '_blank');
  } finally {
    setBusy(null);
  }
}

function ShareSheet({ slug, photo, onClose }) {
  const [busy, setBusy] = useState(null);
  if (photo.kind === 'video') {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share this clip">
          <p className="display" style={{ fontSize: 17, margin: '0 0 4px' }}>Share or save</p>
          <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>Saves the clip as an MP4 you can post anywhere.</p>
          <button className="sheet-option" disabled={busy !== null || !photo.downloadUrl} onClick={() => shareVideo({ photo, setBusy })}>
            <span className="sheet-option-label">{busy ? 'Preparing…' : 'Save / share video'}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {photo.downloadUrl ? 'Full quality MP4' : 'Not available for this clip'}
            </span>
          </button>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share this photo">
        <p className="display" style={{ fontSize: 17, margin: '0 0 4px' }}>Share or save</p>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>Pick a size for where it's going.</p>
        {SHARE_OPTIONS.map((o) => (
          <button
            key={o.format}
            className="sheet-option"
            disabled={busy !== null}
            onClick={() => shareCopy({ slug, photo, format: o.format, setBusy })}
          >
            <span className="sheet-option-label">{busy === o.format ? 'Preparing…' : o.label}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>{o.hint}</span>
          </button>
        ))}
        <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PhotoGallery({
  slug,
  initialPhotos = [],
  initialHasMore = false,
  live = true,
  filter = null,
  query = '',
  emptyText = 'No photos yet. Be the first to add one.',
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sentinel = useRef(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const oldest = photos[photos.length - 1]?.createdAt;
      const before = oldest ? `&before=${encodeURIComponent(oldest)}` : '';
      const res = await fetch(`/api/events/${slug}/photos?limit=${PAGE}${before}${query}`);
      if (!res.ok) return;
      const data = await res.json();
      setPhotos((cur) => {
        const seen = new Set(cur.map((p) => p.id));
        return [...cur, ...data.photos.filter((p) => !seen.has(p.id))];
      });
      setHasMore(Boolean(data.hasMore));
    } catch {
      // Try again on the next scroll.
    } finally {
      setLoadingMore(false);
    }
  }, [slug, photos, hasMore, loadingMore, query]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  // Light polling picks up new photos without websockets.
  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(async () => {
      try {
        const newest = photos[0]?.createdAt;
        const q = newest ? `?since=${encodeURIComponent(newest)}&limit=60` : `?limit=${PAGE}`;
        const res = await fetch(`/api/events/${slug}/photos${q}${query}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.photos.length === 0) return;
        setPhotos((cur) => {
          const seen = new Set(cur.map((p) => p.id));
          return [...data.photos.filter((p) => !seen.has(p.id)), ...cur];
        });
        if (!newest) setHasMore(Boolean(data.hasMore));
      } catch {
        // Next poll will retry.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [slug, live, photos, query]);

  const shown = filter ? photos.filter(filter) : photos;

  function open(p) {
    setShowOriginal(false);
    setSharing(false);
    setActive(p);
  }

  // Swipe (or arrow keys) through neighbours in the enlarged view. Near the
  // end of what's loaded, fetch the next page so the swipe never dead-ends.
  const activeIndex = active ? shown.findIndex((p) => p.id === active.id) : -1;
  const step = useCallback(
    (dir) => {
      if (activeIndex < 0) return;
      const next = shown[activeIndex + dir];
      if (next) open(next);
      if (dir > 0 && activeIndex + dir >= shown.length - 5) loadMore();
    },
    [activeIndex, shown, loadMore]
  );

  useEffect(() => {
    if (!active) return undefined;
    function onKey(e) {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step]);

  const touch = useRef(null);
  function onTouchStart(e) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  }
  function onTouchEnd(e) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // A real sideways swipe: mostly horizontal, far enough, quick enough.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - start.at < 800) {
      step(dx < 0 ? 1 : -1);
    }
  }

  return (
    <>
      {shown.length === 0 && !hasMore && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>{emptyText}</p>
        </div>
      )}
      <div className="gallery-grid">
        {shown.map((p) => (
          <button key={p.id} className="gallery-cell" onClick={() => open(p)}>
            <img
              src={p.thumbUrl || p.url}
              alt={p.aiLabel ? `AI edit: ${p.aiLabel}` : 'Guest photo'}
              loading="lazy"
              decoding="async"
            />
            {p.aiLabel && <span className="ai-tag">AI · {p.aiLabel}</span>}
            {p.kind === 'video' && (
              <span className="video-badge">
                {p.ready ? `▶ ${p.duration ? `${Math.round(p.duration)}s` : ''}` : 'processing'}
              </span>
            )}
          </button>
        ))}
      </div>
      <div ref={sentinel} style={{ height: 1 }} />
      {loadingMore && <p className="muted" style={{ textAlign: 'center' }}>Loading more…</p>}

      {active && (
        <div className="lightbox" onClick={() => setActive(null)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {activeIndex > 0 && (
            <button className="lightbox-arrow is-left" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); step(-1); }}>
              ‹
            </button>
          )}
          {(activeIndex < shown.length - 1 || hasMore) && (
            <button className="lightbox-arrow is-right" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); step(1); }}>
              ›
            </button>
          )}
          <span className="lightbox-count">{activeIndex + 1} / {shown.length}{hasMore ? '+' : ''}</span>
          {active.kind === 'video' && active.ready && active.playerUrl ? (
            <iframe
              src={`${active.playerUrl}?autoplay=true&preload=auto`}
              className="player-frame"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Video clip"
              onClick={(e) => e.stopPropagation()}
            />
          ) : active.kind === 'video' ? (
            <div style={{ color: '#fff', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
              <img src={active.url} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 4, opacity: 0.7 }} />
              <p className="muted" style={{ color: 'rgba(255,255,255,0.7)' }}>Still processing — check back in a moment.</p>
            </div>
          ) : (
            <img
              key={active.id}
              src={showOriginal && active.originalUrl ? active.originalUrl : active.mediumUrl || active.url}
              alt=""
              className="lightbox-img"
            />
          )}
          <div className="lightbox-meta" onClick={(e) => e.stopPropagation()}>
            {active.guestName && <span className="muted" style={{ color: 'rgba(255,255,255,0.7)' }}>{active.guestName}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-primary" onClick={() => setSharing(true)}>Share / Save</button>
            {active.originalUrl && (
              <button
                className="btn btn-secondary"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? `Show ${active.aiLabel} edit` : 'Show original'}
              </button>
            )}
          </div>
          {sharing && <ShareSheet slug={slug} photo={active} onClose={() => setSharing(false)} />}
        </div>
      )}
    </>
  );
}
