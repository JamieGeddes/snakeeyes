import { describe, expect, it } from 'vitest';
import { HighScore, type KeyValueStore } from './highScore';

const memoryStore = (initial?: string): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('snakeeyes.highScore', initial);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};

describe('HighScore', () => {
  it('starts at zero and records a better score', () => {
    const store = memoryStore();
    const hs = new HighScore(store);
    expect(hs.best).toBe(0);
    expect(hs.submit(7)).toBe(true);
    expect(hs.best).toBe(7);
    expect(store.data.get('snakeeyes.highScore')).toBe('7');
  });

  it('ignores scores that do not beat the best', () => {
    const hs = new HighScore(memoryStore('10'));
    expect(hs.submit(10)).toBe(false);
    expect(hs.submit(3)).toBe(false);
    expect(hs.best).toBe(10);
  });

  it('treats corrupt stored values as zero', () => {
    expect(new HighScore(memoryStore('banana')).best).toBe(0);
    expect(new HighScore(memoryStore('-4')).best).toBe(0);
  });

  it('copes with missing or failing storage', () => {
    expect(new HighScore(null).best).toBe(0);
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const hs = new HighScore(broken);
    expect(hs.best).toBe(0);
    expect(hs.submit(5)).toBe(true);
  });
});
