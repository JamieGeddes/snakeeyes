export type CameraErrorReason = 'denied' | 'not-found' | 'in-use' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  readonly reason: CameraErrorReason;

  constructor(reason: CameraErrorReason) {
    super(describeCameraError(reason));
    this.name = 'CameraError';
    this.reason = reason;
  }
}

/** Maps a getUserMedia DOMException name to a reason we can explain to the player. */
export function cameraErrorReason(name: string): CameraErrorReason {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    default:
      return 'unknown';
  }
}

export function describeCameraError(reason: CameraErrorReason): string {
  switch (reason) {
    case 'denied':
      return 'Camera access was blocked. Allow the camera for this site in Chrome and try again.';
    case 'not-found':
      return 'No camera was found. Connect a webcam and try again.';
    case 'in-use':
      return 'The camera is in use by another app. Close it and try again.';
    case 'unsupported':
      return 'This browser cannot access the camera. Use Chrome over localhost or HTTPS.';
    case 'unknown':
      return 'The camera could not be started.';
  }
}

/** Starts the front camera and plays it into `video`. Audio is never requested. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (e) {
    throw new CameraError(e instanceof DOMException ? cameraErrorReason(e.name) : 'unknown');
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
