import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function CopyButton({ text, label }) {
  const [state, setState] = useState(label);
  return (
    <button
      className="btn btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('Copied');
          setTimeout(() => setState(label), 1500);
        } catch {
          window.prompt('Copy this link', text);
        }
      }}
    >
      {state}
    </button>
  );
}

function dataUrlToFile(dataUrl, name) {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// Opens the phone's share sheet (Messages, WhatsApp, email…) with the
// message, the link, and, where the phone allows it, the QR image too.
// Falls back to copying the message on computers without a share sheet.
function ShareButton({ text, url, file, label, primary = false }) {
  const [state, setState] = useState(label);
  async function share() {
    const message = `${text}\n${url}`;
    try {
      if (navigator.share) {
        const withFile = file && navigator.canShare?.({ files: [file] });
        await navigator.share(withFile ? { files: [file], text: message } : { text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setState('Message copied');
      setTimeout(() => setState(label), 1500);
    } catch (err) {
      if (err?.name !== 'AbortError') window.prompt('Copy this message', message);
    }
  }
  return (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`} onClick={share}>
      {state}
    </button>
  );
}

// The QR code and both links carry the event's secret key. Anyone who opens
// one gets in; anyone who only guesses the address doesn't.
export default function QRCodeCard({ url, albumUrl, signageHref, wallUrl, eventName = '' }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [bigUrl, setBigUrl] = useState(null); // sharper copy for saving and sharing
  const fileBase = (eventName || 'event').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'event';
  const qrFile = bigUrl ? dataUrlToFile(bigUrl, `${fileBase}-QR.png`) : null;
  const inviteText = `Add your photos${eventName ? ` from ${eventName}` : ''}! Tap the link or scan the QR code:`;
  const albumText = `See everyone's photos${eventName ? ` from ${eventName}` : ''}:`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#14181c', light: '#ffffffff' } }).then(
      (d) => {
        if (!cancelled) setDataUrl(d);
      }
    );
    QRCode.toDataURL(url, { margin: 3, width: 1024, color: { dark: '#14181c', light: '#ffffffff' } }).then(
      (d) => {
        if (!cancelled) setBigUrl(d);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      {dataUrl ? (
        <img src={dataUrl} alt="QR code" style={{ width: '100%', maxWidth: 240, margin: '0 auto' }} />
      ) : (
        <div style={{ height: 240 }} />
      )}
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Guests scan this to add photos. The album is private: only people who scan the code or
        open one of these links can see it.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <ShareButton text={inviteText} url={url} file={qrFile} label="Share QR code & link" primary />
        <a className="btn btn-secondary" href={`sms:?&body=${encodeURIComponent(`${inviteText}\n${url}`)}`}>
          Text the link
        </a>
        {bigUrl && (
          <a className="btn btn-secondary" href={bigUrl} download={`${fileBase}-QR.png`}>Save QR image</a>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <CopyButton text={url} label="Copy guest link" />
        {albumUrl && <CopyButton text={albumUrl} label="Copy album link" />}
        {albumUrl && <ShareButton text={albumText} url={albumUrl} label="Share album link" />}
        {signageHref && (
          <a className="btn btn-secondary" href={signageHref} target="_blank" rel="noreferrer">Print signage</a>
        )}
      </div>
      {albumUrl && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          The album link opens straight to the photos. Send it out after the event so everyone can
          save and share what was taken.
        </p>
      )}
      {wallUrl && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          <a href={wallUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Open the live wall</a> on a
          TV or projector at the venue: a slideshow of new photos with the QR code beside it. Press F for fullscreen.
        </p>
      )}
    </div>
  );
}
