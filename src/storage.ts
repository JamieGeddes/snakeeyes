import type { KeyValueStore } from './game/highScore';

/** localStorage, or null where the browser blocks it. */
export function safeStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
