import { CameraError, requestCameraAccess } from '../camera/camera';
import { cameraList, hasCameraAccess, type CameraInfo } from '../camera/cameraChoice';

export interface CameraPickerOptions {
  /** Called with the picked camera ID, or null for Chrome's default. */
  readonly onChange: (id: string | null) => void;
  /** Without camera access, show a button that asks for it so cameras can be named. */
  readonly canRequestAccess?: boolean;
  /** Called after every refresh, including ones triggered by plugging cameras in or out. */
  readonly onRefresh?: (cameras: readonly CameraInfo[]) => void;
}

/** Camera dropdown for overlay panels and debug pages. Lists update when cameras are plugged in. */
export class CameraPicker {
  readonly element: HTMLDivElement;
  private readonly select: HTMLSelectElement;
  private readonly field: HTMLLabelElement;
  private readonly accessButton: HTMLButtonElement;
  private readonly note: HTMLParagraphElement;
  private readonly options: CameraPickerOptions;
  private selected: string | null = null;
  private cameras: CameraInfo[] = [];

  constructor(options: CameraPickerOptions) {
    this.options = options;
    this.element = document.createElement('div');
    this.element.className = 'camera-picker';

    this.field = document.createElement('label');
    this.field.textContent = 'Camera ';
    this.select = document.createElement('select');
    this.select.addEventListener('change', () => {
      this.selected = this.select.value || null;
      options.onChange(this.selected);
    });
    this.field.append(this.select);

    this.accessButton = document.createElement('button');
    this.accessButton.type = 'button';
    this.accessButton.className = 'secondary';
    this.accessButton.textContent = 'Choose camera';
    this.accessButton.addEventListener('click', () => void this.askForAccess());

    this.note = document.createElement('p');
    this.note.className = 'note';

    this.element.append(this.field, this.accessButton, this.note);
    this.field.hidden = true;
    this.accessButton.hidden = true;

    navigator.mediaDevices?.addEventListener('devicechange', () => void this.refresh());
  }

  /** The cameras from the last refresh. */
  get list(): readonly CameraInfo[] {
    return this.cameras;
  }

  set disabled(value: boolean) {
    this.select.disabled = value;
    this.accessButton.disabled = value;
  }

  /** Re-lists cameras. Pass `selected` to change which one is shown as picked. */
  async refresh(selected?: string | null): Promise<readonly CameraInfo[]> {
    if (selected !== undefined) this.selected = selected;
    const devices = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
    this.cameras = cameraList(devices);
    const access = hasCameraAccess(devices);
    this.accessButton.hidden = access || !this.options.canRequestAccess;
    this.field.hidden = !access;
    this.render();
    this.options.onRefresh?.(this.cameras);
    return this.cameras;
  }

  setNote(text: string): void {
    this.note.textContent = text;
    this.note.hidden = text === '';
  }

  private render(): void {
    const chromeDefault = new Option("Chrome's default", '');
    const options = this.cameras.map((c) => new Option(c.label, c.id));
    this.select.replaceChildren(chromeDefault, ...options);
    const known = this.cameras.some((c) => c.id === this.selected);
    this.select.value = known && this.selected ? this.selected : '';
  }

  private async askForAccess(): Promise<void> {
    this.accessButton.disabled = true;
    try {
      await requestCameraAccess();
      await this.refresh();
      this.select.focus();
    } catch (e) {
      this.setNote(e instanceof CameraError ? e.message : 'Could not list cameras.');
    } finally {
      this.accessButton.disabled = false;
    }
  }
}
