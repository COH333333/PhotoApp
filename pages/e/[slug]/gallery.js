import Head from 'next/head';
import Link from 'next/link';
import { getEvent, pagePhotos, publicPhoto } from '../../../lib/store';
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

  const page = await pagePhotos(params.slug, { limit: 30 });
  return {
    props: {
      event: publicEvent,
      canUpload: uploadsOpen(event),
      initialPhotos: page.photos.map(publicPhoto),
      initialHasMore: page.hasMore,
    },
  };
}

export default function GuestGalleryPage({ event, locked, canUpload, initialPhotos = [], initialHasMore = false }) {
  if (locked) return <LockedEvent event={event} />;
  return <Gallery event={event} canUpload={canUpload} initialPhotos={initialPhotos} initialHasMore={initialHasMore} />;
}

function Gallery({ event, canUpload, initialPhotos, initialHasMore }) {
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
        <PhotoGallery slug={event.slug} initialPhotos={initialPhotos} initialHasMore={initialHasMore} />
      </div>
    </div>
  );
}
