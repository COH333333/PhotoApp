import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import QRCode from 'qrcode';
import { getEvent, pagePhotos, publicPhoto } from '../../../lib/store';
import { guardEventPage, guestLink } from '../../../lib/access';
import { publicEvent } from '../../../lib/publicEvent';
import LockedEvent from '../../../components/LockedEvent';

// The live wall: open it on a TV or projector at the venue. New photos
// appear as they're posted, with the QR code in the corner so people can
// scan straight off the screen.
//
// Open the wall link from the dashboard (it carries the event key). Once
// it's up, press F or tap the screen for fullscreen.

const SLIDE_MS = 7000;
const POLL_MS = 6000;
const RECENT = 40;

export async function getServerSideProps(ctx) {
  const { params, req } = ctx;
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const pub = publicEvent(event);
  const guard = guardEventPage(ctx, event);
  if (guard.redirect) return { redirect: guard.redirect };
  if (guard.locked) return { props: { event: pub, locked: true } };

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = guestLink(`${proto}://${req.headers.host}`, event);
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#14181c', light: '#ffffff' } });
  const page = await pagePhotos(params.slug, { limit: RECENT });
  return { props: { event: pub, qrSvg, initialPhotos: page.photos.map(publicPhoto) } };
}

export default function WallPage({ event, locked, qrSvg, initialPhotos = [] }) {
  if (locked) return <LockedEvent event={event} />;
  return <Wall event={event} qrSvg={qrSvg} initialPhotos={initialPhotos} />;
}

function Wall({ event, qrSvg, initialPhotos }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [index, setIndex] = useState(0);
  const [fresh, setFresh] = useState(null); // a just-arrived photo jumps the queue
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Poll for new photos; a new one is shown immediately.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const newest = photosRef.current[0]?.createdAt;
        const q = newest ? `?since=${encodeURIComponent(newest)}&limit=20` : `?limit=${RECENT}`;
        const res = await fetch(`/api/events/${event.slug}/photos${q}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.photos.length) return;
        setPhotos((cur) => [...data.photos, ...cur].slice(0, RECENT));
        setFresh(data.photos[0]);
        setIndex(0);
      } catch {
        // next poll
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [event.slug]);

  // Slideshow through the recent set.
  useEffect(() => {
    if (photos.length === 0) return undefined;
    const t = setInterval(() => {
      setFresh(null);
      setIndex((i) => (i + 1) % photos.length);
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [photos.length, fresh]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  }

  const current = fresh || photos[index] || null;
  const strip = photos.slice(0, 12);

  return (
    <div className="wall" style={{ '--p': event.primaryColor, '--a': event.accentColor }} onClick={toggleFullscreen}>
      <Head>
        <title>{`${event.name} - live wall`}</title>
      </Head>
      <div className="wall-main">
        {current ? (
          <img key={current.id} src={current.mediumUrl || current.url} alt="" className="wall-photo" />
        ) : (
          <div className="wall-empty">
            <p>Waiting for the first photo…</p>
          </div>
        )}
        {current?.aiLabel && <span className="wall-tag">AI · {current.aiLabel}</span>}
        {fresh && <span className="wall-new">Just added</span>}
      </div>
      <aside className="wall-side">
        <div>
          <p className="wall-eyebrow">Share your photos</p>
          <h1>{event.name}</h1>
          {event.hashtag && <p className="wall-hash">{event.hashtag}</p>}
        </div>
        <div className="wall-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="wall-instr">Scan with your phone's camera to add yours</p>
        <div className="wall-strip">
          {strip.map((p) => (
            <img key={p.id} src={p.thumbUrl || p.url} alt="" className={p.id === current?.id ? 'is-current' : ''} />
          ))}
        </div>
      </aside>

      <style jsx global>{`
        html, body { margin: 0; background: #0e1114; overflow: hidden; }
        .wall {
          position: fixed; inset: 0; display: grid; grid-template-columns: 1fr 24vw; color: #f5f5f2;
          font-family: Georgia, 'Times New Roman', serif; cursor: pointer;
        }
        .wall-main { position: relative; background: #0e1114; display: flex; align-items: center; justify-content: center; }
        .wall-photo {
          max-width: 96%; max-height: 92vh; object-fit: contain; border-radius: 4px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5); animation: wall-in 700ms ease-out;
        }
        @keyframes wall-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: none; } }
        .wall-empty { font-size: 2vw; color: rgba(245,245,242,0.5); }
        .wall-tag, .wall-new {
          position: absolute; bottom: 4vh; font-family: system-ui, sans-serif; font-size: 1.1vw;
          padding: 0.4vw 0.9vw; border-radius: 3px; background: rgba(0,0,0,0.55);
        }
        .wall-tag { left: 3vw; }
        .wall-new { right: 3vw; background: var(--a); color: #14181c; font-weight: 600; }
        .wall-side {
          background: var(--p); padding: 4vh 2vw; display: flex; flex-direction: column; gap: 3vh; text-align: center;
          justify-content: space-between;
        }
        .wall-eyebrow {
          font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.18em;
          font-size: 0.9vw; opacity: 0.8; margin: 0 0 1vh;
        }
        .wall-side h1 { font-size: 2vw; font-weight: 400; margin: 0; line-height: 1.2; }
        .wall-hash { font-family: system-ui, sans-serif; opacity: 0.85; font-size: 1.1vw; margin: 1vh 0 0; }
        .wall-qr { width: 16vw; height: 16vw; margin: 0 auto; background: #fff; padding: 0.8vw; border-radius: 6px; box-sizing: border-box; }
        .wall-qr svg { width: 100%; height: 100%; display: block; }
        .wall-instr { font-family: system-ui, sans-serif; font-size: 1.1vw; margin: 0; opacity: 0.9; }
        .wall-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4vw; }
        .wall-strip img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 2px; opacity: 0.6; }
        .wall-strip img.is-current { opacity: 1; outline: 2px solid var(--a); }
        @media (orientation: portrait) {
          .wall { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
          .wall-side { flex-direction: row; align-items: center; padding: 2vh 4vw; }
          .wall-qr { width: 22vw; height: 22vw; }
          .wall-strip { display: none; }
          .wall-side h1 { font-size: 4vw; }
          .wall-eyebrow, .wall-instr, .wall-hash { font-size: 2.6vw; }
        }
      `}</style>
    </div>
  );
}
