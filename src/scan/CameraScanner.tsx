import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { Icon } from '../ui/Icon';
import { decodeFrame, loadDecoder } from './decoder';
import { CodeStabilizer } from './stabilizer';

interface Props {
  /** A piece was read: the same pipeline as the hand reader takes it from here. */
  onCode: (code: string) => void;
}

type Status = 'starting' | 'running' | 'denied' | 'unavailable';

/** Frame is shrunk to this width before decoding: faster, enough for a label. */
const MAX_WIDTH = 960;
/** Pause between two decodings, so the phone does not run hot. */
const INTERVAL_MS = 120;

/**
 * The phone camera as a second way to read labels. It only produces codes;
 * counting, saving, undo and sounds are the same as for the hand reader.
 * The camera is released when this panel closes or the page is hidden.
 */
export function CameraScanner({ onCode }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const stabilizer = new CodeStabilizer();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    setStatus('starting');

    const release = () => {
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unavailable');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException).name;
        return setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
      if (stopped) return release();
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      let zx: Awaited<ReturnType<typeof loadDecoder>>;
      try {
        zx = await loadDecoder();
      } catch {
        release();
        return setStatus('unavailable');
      }
      if (stopped) return release();
      setStatus('running');

      const tick = async () => {
        if (stopped) return;
        const track = stream?.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') {
          release();
          return setStatus('unavailable'); // e.g. the camera was taken by another app
        }
        if (document.visibilityState === 'visible' && video.videoWidth > 0 && video.readyState >= 2) {
          const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          let code: string | null = null;
          try {
            code = await decodeFrame(zx, ctx.getImageData(0, 0, canvas.width, canvas.height));
          } catch {
            /* a bad frame: try the next one */
          }
          const counted = stabilizer.feed(code, performance.now());
          if (counted) {
            onCodeRef.current(counted);
            setFlash(counted);
            window.setTimeout(() => setFlash((f) => (f === counted ? null : f)), 700);
          }
        }
        timer = window.setTimeout(tick, INTERVAL_MS);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      release();
    };
  }, [attempt]);

  const message =
    status === 'starting' ? t('cameraStarting') : status === 'denied' ? t('cameraDenied') : status === 'unavailable' ? t('cameraUnavailable') : '';

  return (
    <section class="camera" data-testid="camera-panel" data-status={status}>
      <video ref={videoRef} class="camera-video" playsInline muted autoPlay />
      <div class="camera-guide" aria-hidden="true" />
      {status === 'running' && <p class="camera-hint">{t('cameraHint')}</p>}
      {message && (
        <div class="camera-msg" role="status" data-testid="camera-msg">
          <p>{message}</p>
          {(status === 'denied' || status === 'unavailable') && (
            <button type="button" class="btn btn-small" onClick={() => setAttempt((a) => a + 1)} data-testid="camera-retry">
              <Icon name="refresh" size={20} /> {t('retry')}
            </button>
          )}
        </div>
      )}
      {flash && (
        <div class="camera-flash" data-testid="camera-flash" aria-hidden="true">
          <Icon name="check" size={28} />
        </div>
      )}
    </section>
  );
}
