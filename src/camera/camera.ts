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

/**
 * Starts a camera and plays it into `video`. With no `deviceId`, Chrome picks its default.
 * Audio is never requested.
 */
export async function startCamera(
  video: HTMLVideoElement,
  deviceId: string | null = null,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (e) {
    throw toCameraError(e);
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export interface OpenedCamera {
  readonly stream: MediaStream;
  /** The device actually in use, if the browser reports it. */
  readonly deviceId: string | null;
  /** True when `wanted` was not found and Chrome's default was used instead. */
  readonly fellBack: boolean;
}

/** Starts `wanted`, falling back to Chrome's default camera if it isn't connected. */
export async function openCamera(
  video: HTMLVideoElement,
  wanted: string | null,
  start: typeof startCamera = startCamera,
): Promise<OpenedCamera> {
  if (wanted) {
    try {
      const stream = await start(video, wanted);
      return { stream, deviceId: streamDeviceId(stream), fellBack: false };
    } catch (e) {
      if (!(e instanceof CameraError && e.reason === 'not-found')) throw e;
    }
  }
  const stream = await start(video);
  return { stream, deviceId: streamDeviceId(stream), fellBack: wanted !== null };
}

export function streamDeviceId(stream: MediaStream): string | null {
  return stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
}

/** Asks for camera access so device names can be listed, then turns the camera off. */
export async function requestCameraAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    stopCamera(stream);
  } catch (e) {
    throw toCameraError(e);
  }
}

function toCameraError(e: unknown): CameraError {
  return new CameraError(e instanceof DOMException ? cameraErrorReason(e.name) : 'unknown');
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
