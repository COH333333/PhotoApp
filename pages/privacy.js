import Head from 'next/head';
import Link from 'next/link';

// Plain-language privacy policy. Google's sign-in setup asks for a link to
// one before the Drive connection can be published.
const CONTACT = 'trungdo0011@gmail.com';

export default function Privacy() {
  return (
    <div className="page container" style={{ paddingTop: 64, paddingBottom: 64, maxWidth: 720 }}>
      <Head>
        <title>Privacy - Moment Share</title>
      </Head>
      <p className="eyebrow">Moment Share</p>
      <h1 className="display" style={{ fontSize: 30, marginBottom: 8 }}>Privacy policy</h1>
      <p className="muted">Last updated October 24, 2026</p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>What Moment Share is</h2>
      <p>
        Moment Share is a private photo and video sharing app for events. The host of an event shares
        a link or QR code, and guests with that link can add photos and short clips and see what
        others have added.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>What we collect</h2>
      <ul>
        <li>The photos and clips guests choose to upload, and any caption or name they type.</li>
        <li>A random identifier stored in a cookie on the guest's device, so the app can show
          "your photos" and keep upload counts. We do not ask guests for an account or email.</li>
        <li>For the host only: the Google account email used to connect Google Drive.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>How it's used</h2>
      <ul>
        <li>Uploads are shown to people who have the event's link, and copied to the host's Google Drive
          as an archive.</li>
        <li>Photos may be checked automatically by Google Cloud Vision for inappropriate content, and
          optional AI style edits are made by fal.ai when a guest asks for one.</li>
        <li>Videos are stored and played through Cloudflare Stream. Files are stored with Vercel.</li>
        <li>We do not sell data, show ads, or use uploads to train AI models.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Google Drive access</h2>
      <p>
        When the host connects Google Drive, Moment Share asks only for permission to create and
        manage the files and folders it makes itself (the <code>drive.file</code> permission). It
        cannot see or change anything else in the host's Drive. The host can disconnect at any time
        from the app or from their Google account settings. Moment Share's use of information
        received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Keeping and removing photos</h2>
      <p>
        The host can hide or delete any upload, which also removes its Drive copy. Anyone who wants a
        photo of themselves taken down can ask the host, or email us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <p style={{ marginTop: 32 }}>
        <Link href="/">&larr; Moment Share</Link>
      </p>
    </div>
  );
}
