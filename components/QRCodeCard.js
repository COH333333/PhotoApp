import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRCodeCard({ url }) {
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
      <p className="muted" style={{ wordBreak: 'break-all', marginBottom: 12 }}>
        {url}
      </p>
      <button
        className="btn btn-secondary"
        onClick={() => navigator.clipboard?.writeText(url)}
      >
        Copy link
      </button>
    </div>
  );
}
