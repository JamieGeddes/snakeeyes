import type { Delegate } from './faceTracker';
import type { FromWorker, ToWorker, TrackingSample } from './protocol';

/**
 * Runs face tracking in a worker so detection never blocks game rendering.
 * Frames are sent one at a time; while the worker is busy, new frames are skipped.
 */
export class TrackerClient {
  readonly delegate: Delegate;
  private readonly worker: Worker;
  private video: HTMLVideoElement | null = null;
  private onSample: ((s: TrackingSample) => void) | null = null;
  private busy = false;
  private frameHandle = 0;

  private constructor(worker: Worker, delegate: Delegate) {
    this.worker = worker;
    this.delegate = delegate;
    worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      if (e.data.type !== 'sample') return;
      this.busy = false;
      this.onSample?.(e.data.sample);
    });
  }

  /** Spawns the worker and loads the model. `landmarks` adds raw landmarks to samples. */
  static create(options: { landmarks?: boolean } = {}): Promise<TrackerClient> {
    const worker = new Worker(new URL('./tracker.worker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent<FromWorker>): void => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onMessage);
          resolve(new TrackerClient(worker, e.data.delegate));
        } else if (e.data.type === 'error') {
          worker.terminate();
          reject(new Error(e.data.message));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', (e) => {
        worker.terminate();
        reject(new Error(e.message || 'Tracking worker failed to start'));
      });
      const init: ToWorker = { type: 'init', landmarks: options.landmarks ?? false };
      worker.postMessage(init);
    });
  }

  start(video: HTMLVideoElement, onSample: (s: TrackingSample) => void): void {
    this.stop();
    this.video = video;
    this.onSample = onSample;
    this.frameHandle = video.requestVideoFrameCallback(this.pump);
  }

  stop(): void {
    if (this.video) this.video.cancelVideoFrameCallback(this.frameHandle);
    this.video = null;
    this.onSample = null;
  }

  dispose(): void {
    this.stop();
    this.worker.terminate();
  }

  private readonly pump = (): void => {
    const video = this.video;
    if (!video) return;
    if (!this.busy && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.busy = true;
      const t = performance.now();
      createImageBitmap(video)
        .then((bitmap) => {
          const msg: ToWorker = { type: 'frame', bitmap, t };
          this.worker.postMessage(msg, [bitmap]);
        })
        .catch(() => {
          this.busy = false;
        });
    }
    this.frameHandle = video.requestVideoFrameCallback(this.pump);
  };
}
