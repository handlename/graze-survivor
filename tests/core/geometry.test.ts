import { describe, expect, it } from 'vitest';
import {
  computeGrazeTickReward,
  distanceToSegment,
  evaluateHazardContact,
} from '../../src/core/geometry';
import { CORE_RADIUS, GRAZE_RADIUS, type Hazard } from '../../src/core/types';

describe('geometry & graze evaluation', () => {
  it('handles normal and degenerate zero-length segments without NaN', () => {
    expect(distanceToSegment(10, 15, 0, 10, 20, 10)).toBeCloseTo(5, 5);
    expect(distanceToSegment(10, 15, 10, 10, 10, 10)).toBeCloseTo(5, 5);
  });

  it('classifies bullet contact into HIT, GRAZE with normalized closeness, and NONE', () => {
    const bullet: Hazard = {
      id: 'b1',
      kind: 'BULLET',
      x: 100,
      y: 200,
      vx: 0,
      vy: 100,
      radius: 4,
      elapsedMs: 0,
      warningDurationMs: 550,
      grazeTimerMs: 0,
      grazeCount: 0,
    };
    // Center distance = 6 <= CORE_RADIUS(3) + radius(4) = 7 -> HIT
    expect(evaluateHazardContact(100, 206, bullet)).toEqual({ kind: 'HIT' });

    // Center distance = 8 -> distanceToEdge = 8 - 4 = 4 (1px outside coreRadius=3)
    const nearGraze = evaluateHazardContact(100, 208, bullet);
    expect(nearGraze.kind).toBe('GRAZE');
    if (nearGraze.kind === 'GRAZE') {
      expect(nearGraze.distanceToEdge).toBeCloseTo(4, 5);
      expect(nearGraze.closeness).toBeCloseTo(
        1 - (4 - CORE_RADIUS) / (GRAZE_RADIUS - CORE_RADIUS),
        5
      );
    }

    // Center distance = 40 -> distanceToEdge = 36 > GRAZE_RADIUS(24) -> NONE
    expect(evaluateHazardContact(100, 240, bullet)).toEqual({ kind: 'NONE' });
  });

  it('returns NONE for graze range when bullet grazeCount reaches maxGrazeTicks, but still returns HIT on core collision', () => {
    const exhaustedBullet: Hazard = {
      id: 'b-exhausted',
      kind: 'BULLET',
      x: 100,
      y: 200,
      vx: 0,
      vy: 100,
      radius: 4,
      elapsedMs: 100,
      warningDurationMs: 550,
      grazeTimerMs: 0,
      grazeCount: 10,
    };

    // Near graze distance: coreRadius(3) < distToEdge(4) <= grazeRadius(24)
    const grazeResult = evaluateHazardContact(100, 208, exhaustedBullet);
    expect(grazeResult).toEqual({ kind: 'NONE' });

    // Core hit distance: distToEdge(-1) <= coreRadius(3)
    const hitResult = evaluateHazardContact(100, 206, exhaustedBullet);
    expect(hitResult).toEqual({ kind: 'HIT' });
  });

  it('ignores non-active bombs and warning-phase lasers, and evaluates active ones accurately', () => {
    const convergingBomb: Hazard = {
      id: 'bm1',
      kind: 'BOMB',
      x: 150,
      y: 300,
      blastRadius: 40,
      elapsedMs: 200,
      convergeDurationMs: 350,
      holdDurationMs: 550,
      activeDurationMs: 450,
      grazeTimerMs: 0,
    };
    expect(evaluateHazardContact(150, 300, convergingBomb)).toEqual({ kind: 'NONE' });

    const activeBomb: Hazard = { ...convergingBomb, elapsedMs: 950 };
    expect(evaluateHazardContact(150, 330, activeBomb)).toEqual({ kind: 'HIT' });
    expect(evaluateHazardContact(150, 350, activeBomb).kind).toBe('GRAZE');

    const warningLaser: Hazard = {
      id: 'l1',
      kind: 'LASER',
      x1: 0,
      y1: 200,
      x2: 360,
      y2: 200,
      halfWidth: 6,
      elapsedMs: 500,
      warningDurationMs: 750,
      activeDurationMs: 650,
      grazeTimerMs: 0,
    };
    expect(evaluateHazardContact(180, 200, warningLaser)).toEqual({ kind: 'NONE' });

    const activeLaser: Hazard = { ...warningLaser, elapsedMs: 800 };
    expect(evaluateHazardContact(180, 208, activeLaser)).toEqual({ kind: 'HIT' });
    expect(evaluateHazardContact(180, 215, activeLaser).kind).toBe('GRAZE');
  });

  it('scales graze tick score up to 4x at closeness=1 and flags critical graze at closeness >= 0.7', () => {
    const outer = computeGrazeTickReward(0, 2.0);
    expect(outer.scoreDelta).toBe(200);
    expect(outer.comboDelta).toBeCloseTo(0.1, 5);
    expect(outer.isCritical).toBe(false);

    const inner = computeGrazeTickReward(1, 2.0);
    expect(inner.scoreDelta).toBe(800);
    expect(inner.comboDelta).toBeCloseTo(0.35, 5);
    expect(inner.isCritical).toBe(true);
  });
});
