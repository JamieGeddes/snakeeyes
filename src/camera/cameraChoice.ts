import type { KeyValueStore } from '../game/highScore';

const KEY = 'snakeeyes.cameraId';

export interface CameraInfo {
  readonly id: string;
  readonly label: string;
}

/** The fields of MediaDeviceInfo we use, so the helpers can be tested without a browser. */
export interface DeviceLike {
  readonly kind: string;
  readonly deviceId: string;
  readonly label: string;
}

/** The camera the player picked, kept in browser storage. `null` means Chrome's default. */
export class CameraChoice {
  private readonly store: KeyValueStore | null;

  constructor(store: KeyValueStore | null) {
    this.store = store;
  }

  get saved(): string | null {
    try {
      const id = this.store?.getItem(KEY);
      return id ? id : null;
    } catch {
      return null;
    }
  }

  save(id: string | null): void {
    try {
      // Storing an empty string clears the choice; KeyValueStore has no removeItem.
      this.store?.setItem(KEY, id ?? '');
    } catch {
      // Blocked storage: the choice just isn't remembered.
    }
  }
}

/** Video inputs from an enumerateDevices() result, with fallback names for unlabelled ones. */
export function cameraList(devices: readonly DeviceLike[]): CameraInfo[] {
  return devices
    .filter((d) => d.kind === 'videoinput' && d.deviceId !== '')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Chrome hides device names (and IDs) until camera access has been allowed. */
export function hasCameraAccess(devices: readonly DeviceLike[]): boolean {
  return devices.some((d) => d.kind === 'videoinput' && d.label !== '');
}

/** Note shown under the picker: a missing saved camera, or which camera is in use. */
export function cameraNote(
  cameras: readonly CameraInfo[],
  saved: string | null,
  inUse: string | null = null,
): string {
  const inUseLabel = cameras.find((c) => c.id === inUse)?.label;
  if (saved && !cameras.some((c) => c.id === saved)) {
    return inUseLabel
      ? `Your saved camera isn't connected, so Chrome's default is in use: ${inUseLabel}.`
      : "Your saved camera isn't connected, so Chrome's default will be used.";
  }
  return inUseLabel ? `In use: ${inUseLabel}.` : '';
}
