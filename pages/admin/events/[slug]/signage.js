import Head from 'next/head';
import QRCode from 'qrcode';
import { isAdminRequest } from '../../../../lib/auth';
import { getEvent } from '../../../../lib/store';
import { guestLink } from '../../../../lib/access';

// Printable signage: a poster for an easel or the welcome table, and a sheet
// of table cards. It's a plain web page laid out in inches with print CSS,
// so "Print" or "Save as PDF" from any browser (phone included) produces
// the file. No PDF library needed.

export async function getServerSideProps({ req, params }) {
  if (!isAdminRequest(req)) return { redirect: { destination: '/admin/login', permanent: false } };
  const event = await getEvent(params.slug);
  if (!event) return { notFound: true };
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = guestLink(`${proto}://${req.headers.host}`, event);
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#14181c', light: '#ffffff00' } });
  return {
    props: {
      event: {
        name: event.name,
        date: event.date || null,
        hashtag: event.hashtag || '',
        primaryColor: event.primaryColor || '#1f6f63',
        accentColor: event.accentColor || '#e2a73b',
        coverUrl: event.coverUrl || null,
      },
      qrSvg,
      cards: Number.isFinite(Number(params.cards)) ? Number(params.cards) : 4,
    },
  };
}

function prettyDate(date) {
  if (!date) return '';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function Qr({ svg, size }) {
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function Signage({ event, qrSvg }) {
  const date = prettyDate(event.date);
  return (
    <div className="signage" style={{ '--p': event.primaryColor, '--a': event.accentColor }}>
      <Head>
        <title>{`Signage - ${event.name}`}</title>
      </Head>

      <div className="toolbar">
        <div>
          <strong>Signage for {event.name}</strong>
          <div className="muted">Page 1 is a poster, page 2 is four table cards (cut along the lines). Use Print, then Save as PDF if you want a file.</div>
        </div>
        <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      {/* Poster */}
      <section className="sheet poster">
        <div className="poster-band" />
        <div className="poster-body">
          <p className="eyebrow">Share your photos</p>
          <h1>{event.name}</h1>
          {date && <p className="date">{date}</p>}
          <Qr svg={qrSvg} size="4.2in" />
          <p className="instr">Point your phone's camera at the code</p>
          <p className="sub">No app to install. Take photos, add an AI twist, and see everyone's in one album.</p>
          {event.hashtag && <p className="tag">{event.hashtag}</p>}
        </div>
      </section>

      {/* Table cards: 2 × 2 on a letter sheet, each 4.25 × 5.5 in */}
      <section className="sheet cards">
        {[0, 1, 2, 3].map((i) => (
          <div className="tcard" key={i}>
            <p className="eyebrow">Share your photos</p>
            <h2>{event.name}</h2>
            <Qr svg={qrSvg} size="2.1in" />
            <p className="instr">Scan with your camera</p>
            {event.hashtag && <p className="tag">{event.hashtag}</p>}
          </div>
        ))}
      </section>

      <style jsx global>{`
        @page { size: letter; margin: 0; }
        html, body { margin: 0; background: #ddd; }
        .signage { font-family: Georgia, 'Times New Roman', serif; color: #14181c; }
        .toolbar {
          display: flex; justify-content: space-between; align-items: center; gap: 16px;
          padding: 16px 24px; background: #14181c; color: #f5f5f2; font-family: system-ui, sans-serif;
          position: sticky; top: 0; z-index: 2;
        }
        .toolbar .muted { color: rgba(245,245,242,0.65); font-size: 13px; margin-top: 4px; }
        .toolbar .btn {
          background: var(--a); color: #14181c; border: 0; padding: 12px 18px; font-size: 15px;
          border-radius: 4px; cursor: pointer; white-space: nowrap; font-family: inherit;
        }
        .sheet {
          width: 8.5in; height: 11in; margin: 24px auto; background: #fff; box-sizing: border-box;
          position: relative; overflow: hidden; page-break-after: always; break-after: page;
        }
        .poster-band { height: 0.6in; background: var(--p); }
        .poster-body { padding: 0.7in 0.9in; text-align: center; }
        .eyebrow {
          font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.18em;
          font-size: 11pt; color: var(--p); margin: 0 0 0.15in;
        }
        .poster h1 { font-size: 34pt; font-weight: 400; margin: 0; line-height: 1.15; }
        .poster .date { font-size: 14pt; color: #555; margin: 0.1in 0 0.5in; }
        .qr { margin: 0 auto; }
        .qr svg { width: 100%; height: 100%; display: block; }
        .instr { font-family: system-ui, sans-serif; font-size: 15pt; margin: 0.4in 0 0.1in; }
        .poster .sub { font-size: 12.5pt; color: #555; margin: 0 auto; max-width: 5.2in; line-height: 1.45; }
        .tag { font-family: system-ui, sans-serif; color: var(--p); font-size: 14pt; margin-top: 0.35in; }
        .cards { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .tcard {
          border: 1px dashed #bbb; text-align: center; padding: 0.45in 0.3in; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .tcard h2 { font-size: 17pt; font-weight: 400; margin: 0 0 0.25in; line-height: 1.2; }
        .tcard .instr { font-size: 11pt; margin: 0.2in 0 0; }
        .tcard .tag { font-size: 10.5pt; margin-top: 0.15in; }
        @media print {
          html, body { background: #fff; }
          .toolbar { display: none; }
          .sheet { margin: 0; box-shadow: none; }
        }
        @media screen and (max-width: 900px) {
          .sheet { transform-origin: top left; }
        }
      `}</style>
    </div>
  );
}
