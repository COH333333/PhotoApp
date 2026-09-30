import { useRef, useState } from 'react';
import { preparePhoto } from '../lib/heicConvert';

// facing: 'environment' (back camera) or 'user' (front camera, for selfies)
// onVideo: when given, a "Record a video" option appears alongside the shutter.
export default function CameraCapture({
  onPhoto,
  onVideo,
  facing = 'environment',
  hint = 'Tap to take a photo',
  maxEdge,
  maxVideoSeconds,
}) {
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [preparing, setPreparing] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // The library picker accepts video too, so a clip can come from either input.
    if (file.type.startsWith('video/') && onVideo) {
      onVideo(file);
      return;
    }
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

  function handleVideo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onVideo(file);
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
        accept={onVideo ? 'image/*,video/*,.heic,.heif' : 'image/*,.heic,.heif'}
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      {onVideo && (
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture={facing}
          onChange={handleVideo}
          style={{ display: 'none' }}
        />
      )}

      <button
        className="shutter"
        onClick={() => cameraInputRef.current?.click()}
        aria-label={facing === 'user' ? 'Take a selfie' : 'Take a photo'}
        disabled={preparing}
      />
      <p className="muted" style={{ margin: '12px 0 20px' }}>
        {preparing ? 'Preparing your photo…' : hint}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {onVideo && (
          <button className="btn btn-secondary" onClick={() => videoInputRef.current?.click()} disabled={preparing}>
            Record a video{maxVideoSeconds ? ` (${maxVideoSeconds}s)` : ''}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={() => libraryInputRef.current?.click()}
          disabled={preparing}
        >
          Choose from library
        </button>
      </div>
    </div>
  );
}
