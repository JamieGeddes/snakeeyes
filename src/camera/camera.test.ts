import { describe, expect, it } from 'vitest';
import { cameraErrorReason, describeCameraError } from './camera';

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
