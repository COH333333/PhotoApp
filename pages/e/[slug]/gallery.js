import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getEvent, listPhotos, publicPhoto } from '../../../lib/store';
import PhotoGallery from '../../../components/PhotoGallery';

export async function getServerSideProps({ params }) {
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const photos = await listPhotos(params.slug);
  return {
    props: {
      event: {
        slug: event.slug,
        name: event.name,
        primaryColor: event.primaryColor,
        accentColor: event.accentColor,
      },
      initialPhotos: photos.map(publicPhoto),
    },
  };
}

export default function GuestGalleryPage({ event, initialPhotos }) {
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
          <Link href={`/e/${event.slug}`} className="muted" style={{ textDecoration: 'none' }}>
            &larr; Add a photo
          </Link>
        </div>
        <PhotoGallery photos={photos} />
      </div>
    </div>
  );
}
