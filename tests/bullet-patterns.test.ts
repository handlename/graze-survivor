import { describe, expect, it } from 'vitest';
import { evaluateHazardContact } from '../src/core/geometry';
import {
  computeThreatLevel,
  getBulletPhase,
  pickInFieldSafeSpawnPoint,
  spawnBulletPatternById,
  spawnBulletStream,
  stepHazards,
} from '../src/core/hazards';
import { GAME_PARAMS } from '../src/core/params';
import { HUD_HEIGHT, LOGICAL_HEIGHT, LOGICAL_WIDTH, type BulletHazard } from '../src/core/types';

describe('BulletHazard Telegraph Lifecycle & 10 Patterns', () => {
  it('returns NONE for contact while bullet is in WARNING phase (elapsedMs < 0)', () => {
    const sleepingBullet: BulletHazard = {
      id: 'b-sleep',
      kind: 'BULLET',
      x: 180,
      y: 300,
      vx: 0,
      vy: 92,
      radius: 4,
      elapsedMs: -200,
      warningDurationMs: 550,
      grazeTimerMs: 0,
    };
    expect(getBulletPhase(sleepingBullet)).toBe('WARNING');
    expect(evaluateHazardContact(180, 300, sleepingBullet)).toEqual({ kind: 'NONE' });
    expect(evaluateHazardContact(180, 310, sleepingBullet)).toEqual({ kind: 'NONE' });
  });

  it('interpolates partial frame movement when transitioning from WARNING to ACTIVE', () => {
    const b: BulletHazard = {
      id: 'b-trans',
      kind: 'BULLET',
      x: 100,
      y: 200,
      vx: 100,
      vy: 0,
      radius: 4,
      elapsedMs: -10,
      warningDurationMs: 550,
      grazeTimerMs: 0,
    };
    const [stepped] = stepHazards([b], 25) as BulletHazard[];
    expect(stepped.elapsedMs).toBe(15);
    expect(getBulletPhase(stepped)).toBe('ACTIVE');
    expect(stepped.x).toBeCloseTo(100 + 100 * 0.015, 5);
    expect(stepped.y).toBeCloseTo(200, 5);
  });

  it('picks an in-field spawn point at least inFieldMinSafeDistance away from the player and falls back to furthest candidate when constrained', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const playerPos = { x: 180, y: 360 };
    for (let i = 0; i < 30; i++) {
      const pt = pickInFieldSafeSpawnPoint(playerPos, rng);
      const dist = Math.hypot(pt.startX - playerPos.x, pt.startY - playerPos.y);
      expect(dist).toBeGreaterThanOrEqual(GAME_PARAMS.bullet.inFieldMinSafeDistance);
      expect(pt.startX).toBeGreaterThanOrEqual(GAME_PARAMS.bullet.inFieldMarginX);
      expect(pt.startX).toBeLessThanOrEqual(LOGICAL_WIDTH - GAME_PARAMS.bullet.inFieldMarginX);
      expect(pt.startY).toBeGreaterThanOrEqual(HUD_HEIGHT + GAME_PARAMS.bullet.inFieldMarginY);
      expect(pt.startY).toBeLessThanOrEqual(LOGICAL_HEIGHT - GAME_PARAMS.bullet.inFieldMarginY);
    }

    // Fallback when safe distance is impossibly large (e.g. 9999px)
    const hugeSafeParams = {
      ...GAME_PARAMS,
      bullet: { ...GAME_PARAMS.bullet, inFieldMinSafeDistance: 9999 },
    };
    const fallbackPt = pickInFieldSafeSpawnPoint(playerPos, rng, hugeSafeParams);
    expect(Number.isFinite(fallbackPt.startX)).toBe(true);
    expect(Number.isFinite(fallbackPt.startY)).toBe(true);
  });

  it('spawns all 10 patterns (0..9) with negative elapsedMs and increases density at higher threat levels', () => {
    const lowThreat = computeThreatLevel(0);
    const highThreat = computeThreatLevel(90_000); // Lv.6
    const playerPos = { x: 180, y: 400 };

    for (let patternId = 0; patternId <= 9; patternId++) {
      const lowBullets = spawnBulletPatternById(patternId, lowThreat, playerPos, 'low', () => 0.35);
      const highBullets = spawnBulletPatternById(patternId, highThreat, playerPos, 'high', () => 0.35);

      expect(lowBullets.length).toBeGreaterThan(0);
      expect(highBullets.length).toBeGreaterThan(lowBullets.length);

      for (const b of highBullets) {
        expect(b.elapsedMs).toBeLessThan(0);
        expect(b.warningDurationMs).toBeGreaterThanOrEqual(GAME_PARAMS.bullet.warningDurationMs);
        expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(0);
      }
    }
  });

  it('gates pattern unlocks by threat level in spawnBulletStream', () => {
    const lv0Threat = computeThreatLevel(0); // Only patterns 0 (LINE) and 1 (FAN) unlocked
    const playerPos = { x: 180, y: 400 };
    const highRollBullets = spawnBulletStream(lv0Threat, playerPos, 'lv0', () => 0.99);
    expect(highRollBullets.every((b) => b.id.includes('-fan-'))).toBe(true);
  });
});
