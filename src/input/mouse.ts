import { vec, type Vec2 } from '../game/vec';
import type { InputSample, InputSource } from './types';

/** Debug-only input: steers towards the mouse pointer. */
export class MouseInput implements InputSource {
  private target: Vec2 | null = null;

  private readonly onMove = (e: PointerEvent): void => {
    this.target = vec(e.clientX, e.clientY);
  };

  private readonly onLeave = (): void => {
    this.target = null;
  };

  constructor() {
    window.addEventListener('pointermove', this.onMove);
    document.documentElement.addEventListener('pointerleave', this.onLeave);
  }

  sample(): InputSample {
    return { target: this.target, confidence: this.target ? 1 : 0 };
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
  }
}
