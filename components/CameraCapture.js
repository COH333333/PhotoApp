import { useRef, useState } from 'react';
import { preparePhoto } from '../lib/heicConvert';

// facing: 'environment' (back camera) or 'user' (front camera, for selfies)
export default function CameraCapture({ onPhoto, facing = 'environment', hint = 'Tap to take a photo', maxEdge }) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const [preparing, setPreparing] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      onPhoto(await preparePhoto(file, maxEdge ? { maxEdge } : undefined));
    } catch (err) {
      console.error('Could not process photo:', err);
      alert("Couldn't read that photo. Try another one.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture={facing}
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <button
        className="shutter"
        onClick={() => cameraInputRef.current?.click()}
        aria-label={facing === 'user' ? 'Take a selfie' : 'Take a photo'}
        disabled={preparing}
      />
      <p className="muted" style={{ margin: '12px 0 20px' }}>
        {preparing ? 'Preparing your photo…' : hint}
      </p>
      <button
        className="btn btn-secondary"
        onClick={() => libraryInputRef.current?.click()}
        disabled={preparing}
      >
        Choose from library instead
      </button>
    </div>
  );
}
