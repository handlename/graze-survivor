import { describe, expect, it, vi } from 'vitest';
import {
  handleUrlResetParam,
  hasSeenFirstTip,
  loadControlOptions,
  loadRanking,
  markFirstTipSeen,
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
      'graze-survivor:rankings': '{not-valid-json',
      'graze-survivor:options': 'null',
    });
    expect(loadRanking(store)).toEqual([]);
    expect(loadControlOptions(store).mode).toBe('SWIPE');
  });

  it('clears ranking storage and strips ?reset=1 from URL', () => {
    const store = createMemoryStorage({ 'graze-survivor:rankings': '[{"score":999}]' });
    const replaceState = vi.fn();
    const didReset = handleUrlResetParam(
      { search: '?reset=1&foo=bar', pathname: '/graze-survivor/', hash: '' },
      { replaceState },
      store
    );
    expect(didReset).toBe(true);
    expect(loadRanking(store)).toEqual([]);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/graze-survivor/?foo=bar');
  });

  it('persists first-tip seen state, clamps startLevel in control options, and preserves startLevel on rankings', () => {
    const store = createMemoryStorage({
      'graze-survivor:options': JSON.stringify({ mode: 'SWIPE', startLevel: -99 }),
      'graze-survivor:rankings': JSON.stringify([
        {
          score: 80000,
          survivalTimeMs: 40000,
          maxCombo: 10.0,
          totalGrazeCount: 100,
          timestamp: '2026-11-01 20:00:00',
        },
        {
          score: 90000,
          survivalTimeMs: 50000,
          maxCombo: 14.0,
          totalGrazeCount: 120,
          timestamp: '2026-11-01 20:10:00',
          startLevel: -3,
        },
      ]),
    });

    expect(hasSeenFirstTip(store)).toBe(false);
    markFirstTipSeen(store);
    expect(hasSeenFirstTip(store)).toBe(true);

    expect(loadControlOptions(store).startLevel).toBe(-5);

    const rankings = loadRanking(store);
    expect(rankings[0].startLevel).toBe(-3);
    expect(rankings[1].startLevel).toBe(0);

    const replaceState = vi.fn();
    handleUrlResetParam(
      { search: '?reset=1', pathname: '/graze-survivor/', hash: '' },
      { replaceState },
      store
    );
    expect(hasSeenFirstTip(store)).toBe(false);
  });
});
