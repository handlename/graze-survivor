import { describe, expect, it } from 'vitest';
import { GAME_PARAMS } from '../src/core/params';

describe('Bullet & Telegraph Parameters', () => {
  it('loads all 10 bullet pattern parameters and telegraph effect settings', () => {
    expect(GAME_PARAMS.bullet.warningDurationMs).toBe(550);
    expect(GAME_PARAMS.bullet.edgeInsetMargin).toBe(18);
    expect(GAME_PARAMS.bullet.inFieldMinSafeDistance).toBe(110);
    expect(GAME_PARAMS.bullet.starUnlockLevel).toBe(6);
    expect(GAME_PARAMS.bullet.flowerSpeedMod).toBeGreaterThan(0);
    expect(GAME_PARAMS.bullet.flowerSpeedMod).toBeLessThan(1);
    expect(GAME_PARAMS.effects.bulletTelegraphBasePreviewSec).toBe(0.18);
    expect(GAME_PARAMS.effects.bulletTelegraphStaggerPreviewScale).toBe(0.35);
    expect(GAME_PARAMS.effects.bulletTelegraphSnapThreshold).toBe(0.78);
  });
});
