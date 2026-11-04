import { openCamera, stopCamera, type OpenedCamera } from '../camera/camera';
import type { TrackingSample } from './protocol';
import { TrackerClient } from './trackerClient';

export interface TrackingSessionOptions {
  readonly video: HTMLVideoElement;
  readonly onSample: (sample: TrackingSample) => void;
  /** Called when the camera in use stops on its own, e.g. it was unplugged. */
  readonly onCameraLost: () => void;
  readonly landmarks?: boolean;
}

/** A camera feeding the tracking worker. The worker is kept when switching cameras. */
export class TrackingSession {
  private readonly options: TrackingSessionOptions;
  private trackerReady: Promise<TrackerClient> | null = null;
  private tracker: TrackerClient | null = null;
  private current: MediaStream | null = null;
  private inUse: string | null = null;

  constructor(options: TrackingSessionOptions) {
    this.options = options;
  }

  get active(): boolean {
    return this.current !== null;
  }

  get stream(): MediaStream | null {
    return this.current;
  }

  /** Device ID of the camera in use. */
  get cameraInUse(): string | null {
    return this.inUse;
  }

  get delegate(): string | null {
    return this.tracker?.delegate ?? null;
  }

  /** Opens `cameraId` (null for Chrome's default) and starts tracking, closing any camera in use. */
  async open(cameraId: string | null): Promise<OpenedCamera> {
    this.close();
    const { video, landmarks = false } = this.options;
    this.trackerReady ??= TrackerClient.create({ landmarks });
    let tracker: TrackerClient;
    let camera: OpenedCamera;
    try {
      [tracker, camera] = await Promise.all([this.trackerReady, openCamera(video, cameraId)]);
    } catch (e) {
      // Retry the worker next time unless it loaded fine.
      if (!this.tracker) this.trackerReady = null;
      throw e;
    }
    this.tracker = tracker;
    this.current = camera.stream;
    this.inUse = camera.deviceId;
    camera.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (this.current !== camera.stream) return;
      this.close();
      this.options.onCameraLost();
    });
    tracker.start(video, this.options.onSample);
    return camera;
  }

  close(): void {
    this.tracker?.stop();
    if (this.current) stopCamera(this.current);
    this.current = null;
    this.inUse = null;
  }
}
