import { describe, expect, it, vi } from 'vitest';
import { CameraError, cameraErrorReason, describeCameraError, openCamera } from './camera';

describe('cameraErrorReason', () => {
  it('maps getUserMedia errors to player-facing reasons', () => {
    expect(cameraErrorReason('NotAllowedError')).toBe('denied');
    expect(cameraErrorReason('NotFoundError')).toBe('not-found');
    expect(cameraErrorReason('NotReadableError')).toBe('in-use');
    expect(cameraErrorReason('Weird')).toBe('unknown');
  });

  it('has a message for every reason', () => {
    for (const r of ['denied', 'not-found', 'in-use', 'unsupported', 'unknown'] as const) {
      expect(describeCameraError(r).length).toBeGreaterThan(0);
    }
  });
});

describe('openCamera', () => {
  const video = {} as HTMLVideoElement;
  const fakeStream = (deviceId: string): MediaStream =>
    ({ getVideoTracks: () => [{ getSettings: () => ({ deviceId }) }] }) as unknown as MediaStream;

  it('opens the wanted camera', async () => {
    const start = vi.fn((_v: HTMLVideoElement, id: string | null = null) =>
      Promise.resolve(fakeStream(id ?? 'default')),
    );
    const opened = await openCamera(video, 'usb', start);
    expect(opened.deviceId).toBe('usb');
    expect(opened.fellBack).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("falls back to Chrome's default when the wanted camera is missing", async () => {
    const start = vi.fn((_v: HTMLVideoElement, id: string | null = null) =>
      id ? Promise.reject(new CameraError('not-found')) : Promise.resolve(fakeStream('built-in')),
    );
    const opened = await openCamera(video, 'usb', start);
    expect(opened.deviceId).toBe('built-in');
    expect(opened.fellBack).toBe(true);
  });

  it('does not fall back when access is denied', async () => {
    const start = vi.fn(() => Promise.reject(new CameraError('denied')));
    await expect(openCamera(video, 'usb', start)).rejects.toThrow(CameraError);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('uses the default when nothing is saved', async () => {
    const start = vi.fn(() => Promise.resolve(fakeStream('built-in')));
    const opened = await openCamera(video, null, start);
    expect(opened.fellBack).toBe(false);
    expect(start).toHaveBeenCalledWith(video);
  });
});
