export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'snakeeyes.highScore';

/** Best score kept in browser storage. Storage failures (e.g. blocked storage) are ignored. */
export class HighScore {
  private readonly store: KeyValueStore | null;

  constructor(store: KeyValueStore | null) {
    this.store = store;
  }

  get best(): number {
    try {
      const value = Number(this.store?.getItem(KEY) ?? 0);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }

  /** Records `score` if it beats the best; returns true when it does. */
  submit(score: number): boolean {
    if (score <= this.best) return false;
    try {
      this.store?.setItem(KEY, String(score));
    } catch {
      // Not fatal: the score just won't persist.
    }
    return true;
  }
}
