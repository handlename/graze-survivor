import { describe, expect, it, vi } from 'vitest';
import {
  handleUrlResetParam,
  loadControlOptions,
  loadRanking,
  saveRankingRecord,
} from '../../src/shell/storage';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe('local ranking and options persistence', () => {
  it('sorts top 10 rankings by score descending and tie-breaks by survivalTimeMs descending', () => {
    const store = createMemoryStorage();
    saveRankingRecord(
      {
        score: 50000,
        survivalTimeMs: 30000,
        maxCombo: 12.5,
        totalGrazeCount: 80,
        timestamp: '2026-10-25 21:00:00',
      },
      store
    );
    const second = saveRankingRecord(
      {
        score: 120000,
        survivalTimeMs: 45000,
        maxCombo: 28.0,
        totalGrazeCount: 190,
        timestamp: '2026-10-25 21:05:00',
      },
      store
    );
    expect(second.isNewRecord).toBe(true);
    expect(second.rankIndex).toBe(0);
    expect(second.rankings.map((r) => r.score)).toEqual([120000, 50000]);
  });

  it('survives corrupted JSON in localStorage without throwing', () => {
    const store = createMemoryStorage({
      'dodge-survivor:rankings': '{not-valid-json',
      'dodge-survivor:options': 'null',
    });
    expect(loadRanking(store)).toEqual([]);
    expect(loadControlOptions(store).mode).toBe('SWIPE');
  });

  it('clears ranking storage and strips ?reset=1 from URL', () => {
    const store = createMemoryStorage({ 'dodge-survivor:rankings': '[{"score":999}]' });
    const replaceState = vi.fn();
    const didReset = handleUrlResetParam(
      { search: '?reset=1&foo=bar', pathname: '/dodge-survivor/', hash: '' },
      { replaceState },
      store
    );
    expect(didReset).toBe(true);
    expect(loadRanking(store)).toEqual([]);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/dodge-survivor/?foo=bar');
  });
});
