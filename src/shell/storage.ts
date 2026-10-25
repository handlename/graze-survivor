import type { ControlOptions, RankingRecord } from '../core/types';

export const RANKING_STORAGE_KEY = 'dodge-survivor:rankings';
export const OPTIONS_STORAGE_KEY = 'dodge-survivor:options';
const MAX_RANKINGS = 10;

export const DEFAULT_CONTROL_OPTIONS: ControlOptions = {
  mode: 'SWIPE',
  swipeSpeed: 1.2,
  swipeAccel: 0.8,
  gyroSensitivity: 4.5,
  invertX: false,
  invertY: false,
  soundEnabled: true,
};

function getDefaultStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function loadRanking(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage()
): readonly RankingRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RANKING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RankingRecord =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.score === 'number' &&
          typeof item.survivalTimeMs === 'number' &&
          typeof item.maxCombo === 'number' &&
          typeof item.totalGrazeCount === 'number' &&
          typeof item.timestamp === 'string'
      )
      .sort((a, b) => b.score - a.score || b.survivalTimeMs - a.survivalTimeMs)
      .slice(0, MAX_RANKINGS);
  } catch {
    return [];
  }
}

export function saveRankingRecord(
  record: RankingRecord,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = getDefaultStorage()
): {
  readonly rankings: readonly RankingRecord[];
  readonly isNewRecord: boolean;
  readonly rankIndex: number;
} {
  const previous = loadRanking(storage);
  const prevBest = previous.length > 0 ? previous[0].score : -1;
  const combined = [...previous, record].sort(
    (a, b) => b.score - a.score || b.survivalTimeMs - a.survivalTimeMs
  );
  const rankings = combined.slice(0, MAX_RANKINGS);
  const rankIndex = rankings.indexOf(record);
  const isNewRecord = record.score > prevBest && record.score > 0;

  if (storage) {
    try {
      storage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
    } catch {
      // Ignore quota errors
    }
  }

  return {
    rankings,
    isNewRecord,
    rankIndex,
  };
}

export function loadControlOptions(
  storage: Pick<Storage, 'getItem'> | undefined = getDefaultStorage()
): ControlOptions {
  if (!storage) return DEFAULT_CONTROL_OPTIONS;
  try {
    const raw = storage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONTROL_OPTIONS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_CONTROL_OPTIONS;

    return {
      mode: parsed.mode === 'GYRO' ? 'GYRO' : 'SWIPE',
      swipeSpeed:
        typeof parsed.swipeSpeed === 'number'
          ? Math.max(0.5, Math.min(2.5, parsed.swipeSpeed))
          : DEFAULT_CONTROL_OPTIONS.swipeSpeed,
      swipeAccel:
        typeof parsed.swipeAccel === 'number'
          ? Math.max(0.0, Math.min(2.0, parsed.swipeAccel))
          : DEFAULT_CONTROL_OPTIONS.swipeAccel,
      gyroSensitivity:
        typeof parsed.gyroSensitivity === 'number'
          ? Math.max(1.0, Math.min(10.0, parsed.gyroSensitivity))
          : DEFAULT_CONTROL_OPTIONS.gyroSensitivity,
      invertX: Boolean(parsed.invertX),
      invertY: Boolean(parsed.invertY),
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_CONTROL_OPTIONS.soundEnabled,
    };
  } catch {
    return DEFAULT_CONTROL_OPTIONS;
  }
}

export function saveControlOptions(
  options: ControlOptions,
  storage: Pick<Storage, 'setItem'> | undefined = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Ignore storage quota errors
  }
}

export function handleUrlResetParam(
  loc: { search: string; pathname: string; hash: string } = window.location,
  hist: { replaceState: (data: unknown, unused: string, url?: string | URL | null) => void } = window.history,
  storage: Pick<Storage, 'removeItem'> | undefined = getDefaultStorage()
): boolean {
  const params = new URLSearchParams(loc.search);
  if (params.get('reset') !== '1') {
    return false;
  }
  storage?.removeItem(RANKING_STORAGE_KEY);
  params.delete('reset');
  const query = params.toString();
  const cleanUrl = `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`;
  hist.replaceState(null, '', cleanUrl);
  return true;
}

export function formatSurvivalTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    millis
  ).padStart(3, '0')}`;
}

export function formatTimestamp(date: Date = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
