import { describe, expect, it } from 'vitest';
import type { GazeSample } from './features';
import { LOST_AFTER_MS, PresenceMonitor } from './presence';
import { syntheticInputs } from './simulate';

const face = (t: number, blinking = false): GazeSample => ({
  t,
  inputs: syntheticInputs({ x: 50, y: 50 }, { width: 100, height: 100 }, 0, Math.random),
  blinking,
});
const noFace = (t: number): GazeSample => ({ t, inputs: null, blinking: false });

describe('PresenceMonitor', () => {
  it('counts as lost before any face has been seen', () => {
    expect(new PresenceMonitor().lost(0)).toBe('no-face');
  });

  it('is present while a face with open eyes keeps arriving', () => {
    const p = new PresenceMonitor();
    for (let t = 0; t <= 2000; t += 33) p.update(face(t));
    expect(p.lost(2000)).toBeNull();
  });

  it('ignores a short face drop-out but not a long one', () => {
    const p = new PresenceMonitor();
    p.update(face(0));
    for (let t = 33; t <= 400; t += 33) p.update(noFace(t));
    expect(p.lost(400)).toBeNull();
    expect(p.lost(LOST_AFTER_MS + 1)).toBe('no-face');
  });

  it('counts as lost when samples stop arriving', () => {
    const p = new PresenceMonitor();
    p.update(face(1000));
    expect(p.lost(1000 + LOST_AFTER_MS + 1)).toBe('no-face');
  });

  it('ignores blinks but pauses for eyes held shut', () => {
    const p = new PresenceMonitor();
    p.update(face(0));
    for (let t = 33; t <= 300; t += 33) p.update(face(t, true));
    p.update(face(333));
    expect(p.lost(333)).toBeNull();
    for (let t = 366; t <= 1000; t += 33) p.update(face(t, true));
    expect(p.lost(1000)).toBe('eyes-closed');
  });

  it('recovers once the face is back', () => {
    const p = new PresenceMonitor();
    p.update(face(0));
    expect(p.lost(2000)).toBe('no-face');
    p.update(face(2000));
    expect(p.lost(2000)).toBeNull();
  });
});
