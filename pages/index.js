import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="page container" style={{ paddingTop: 96 }}>
      <Head>
        <title>Moment Share</title>
      </Head>
      <p className="eyebrow">Moment Share</p>
      <h1 className="display" style={{ fontSize: 34, marginBottom: 12 }}>
        A shared photo feed for the day you don't want to miss a single shot of.
      </h1>
      <p className="muted" style={{ marginBottom: 32 }}>
        Guests scan a code, drop in their photos, everyone sees the feed as it fills up.
        Every photo lands straight in your own Google Drive.
      </p>
      <Link href="/admin" className="btn btn-primary">
        Go to host dashboard
      </Link>
    </div>
  );
}
