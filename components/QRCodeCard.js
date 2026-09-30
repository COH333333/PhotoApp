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

// The QR code and both links carry the event's secret key. Anyone who opens
// one gets in; anyone who only guesses the address doesn't.
export default function QRCodeCard({ url, albumUrl }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#14181c', light: '#ffffffff' } }).then(
      (d) => {
        if (!cancelled) setDataUrl(d);
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <CopyButton text={url} label="Copy guest link" />
        {albumUrl && <CopyButton text={albumUrl} label="Copy album link" />}
      </div>
      {albumUrl && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
          The album link opens straight to the photos. Send it out after the event so everyone can
          save and share what was taken.
        </p>
      )}
    </div>
  );
}
