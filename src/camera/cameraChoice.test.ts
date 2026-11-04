import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../game/highScore';
import { CameraChoice, cameraList, cameraNote, hasCameraAccess } from './cameraChoice';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const builtIn = { kind: 'videoinput', deviceId: 'a', label: 'FaceTime HD Camera' };
const usb = { kind: 'videoinput', deviceId: 'b', label: 'USB Webcam' };
const mic = { kind: 'audioinput', deviceId: 'm', label: 'Microphone' };

describe('CameraChoice', () => {
  it('saves, reads back and clears the chosen camera', () => {
    const choice = new CameraChoice(memoryStore());
    expect(choice.saved).toBeNull();
    choice.save('b');
    expect(choice.saved).toBe('b');
    choice.save(null);
    expect(choice.saved).toBeNull();
  });

  it('tolerates missing or failing storage', () => {
    expect(new CameraChoice(null).saved).toBeNull();
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const choice = new CameraChoice(broken);
    expect(() => choice.save('b')).not.toThrow();
    expect(choice.saved).toBeNull();
  });
});

describe('cameraList', () => {
  it('keeps only cameras and names unlabelled ones', () => {
    const unnamed = { kind: 'videoinput', deviceId: 'c', label: '' };
    expect(cameraList([builtIn, mic, unnamed])).toEqual([
      { id: 'a', label: 'FaceTime HD Camera' },
      { id: 'c', label: 'Camera 2' },
    ]);
  });

  it('drops entries without IDs, as Chrome reports before access is allowed', () => {
    expect(cameraList([{ kind: 'videoinput', deviceId: '', label: '' }])).toEqual([]);
  });
});

describe('hasCameraAccess', () => {
  it('is true once camera names are visible', () => {
    expect(hasCameraAccess([builtIn])).toBe(true);
    expect(hasCameraAccess([{ kind: 'videoinput', deviceId: '', label: '' }, mic])).toBe(false);
  });
});

describe('cameraNote', () => {
  const cameras = cameraList([builtIn, usb]);

  it('names the camera in use', () => {
    expect(cameraNote(cameras, 'b', 'b')).toBe('In use: USB Webcam.');
    expect(cameraNote(cameras, null, 'a')).toBe('In use: FaceTime HD Camera.');
  });

  it('says when the saved camera is missing', () => {
    expect(cameraNote(cameras, 'gone', 'a')).toMatch(/isn't connected.*FaceTime HD Camera/);
    expect(cameraNote(cameras, 'gone')).toMatch(/will be used/);
  });

  it('is empty when there is nothing to say', () => {
    expect(cameraNote(cameras, null)).toBe('');
    expect(cameraNote(cameras, 'b')).toBe('');
  });
});
