import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getEvent, listPhotos, publicPhoto } from '../../../lib/store';
import PhotoGallery from '../../../components/PhotoGallery';
import LockedEvent from '../../../components/LockedEvent';
import { guardEventPage } from '../../../lib/access';
import { uploadsOpen } from '../../../lib/eventState';

export async function getServerSideProps(ctx) {
  const { params } = ctx;
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const publicEvent = {
    slug: event.slug,
    name: event.name,
    primaryColor: event.primaryColor,
    accentColor: event.accentColor,
  };
  const guard = guardEventPage(ctx, event);
  if (guard.redirect) return { redirect: guard.redirect };
  if (guard.locked) return { props: { event: publicEvent, locked: true } };

  const photos = await listPhotos(params.slug);
  return {
    props: {
      event: publicEvent,
      canUpload: uploadsOpen(event),
      initialPhotos: photos.map(publicPhoto),
    },
  };
}

export default function GuestGalleryPage({ event, locked, canUpload, initialPhotos = [] }) {
  if (locked) return <LockedEvent event={event} />;
  return <Gallery event={event} canUpload={canUpload} initialPhotos={initialPhotos} />;
}

function Gallery({ event, canUpload, initialPhotos }) {
  const [photos, setPhotos] = useState(initialPhotos);

  // Light polling keeps the album feeling live without needing websockets.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${event.slug}/photos`);
        if (res.ok) {
          const data = await res.json();
          setPhotos(data.photos);
        }
      } catch {
        // Ignore transient network errors; next poll will retry.
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [event.slug]);

  return (
    <div
      className="page"
      style={{ '--event-primary': event.primaryColor, '--event-accent': event.accentColor }}
    >
      <Head>
        <title>{`${event.name} album - Moment Share`}</title>
      </Head>
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <h1 className="display" style={{ fontSize: 22 }}>
            {event.name}
          </h1>
          {canUpload ? (
            <Link href={`/e/${event.slug}`} className="muted" style={{ textDecoration: 'none' }}>
              &larr; Add a photo
            </Link>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Uploads closed</span>
          )}
        </div>
        <PhotoGallery photos={photos} />
      </div>
    </div>
  );
}
