import { describe, expect, it } from 'vitest';
import {
  computeThreatLevel,
  getBombPhase,
  spawnTacticalPattern,
  stepHazards,
} from '../../src/core/hazards';
import type { BombHazard } from '../../src/core/types';

describe('hazards lifecycle and wave director', () => {
  it('progresses bomb through single CONVERGING -> HOLD -> ACTIVE -> EXPIRED lifecycle', () => {
    const bomb: BombHazard = {
      id: 'b1',
      kind: 'BOMB',
      x: 180,
      y: 320,
      blastRadius: 40,
      elapsedMs: 0,
      convergeDurationMs: 350,
      holdDurationMs: 550,
      activeDurationMs: 450,
      grazeTimerMs: 0,
    };

    const start = getBombPhase(bomb);
    expect(start.phase).toBe('CONVERGING');
    expect(start.currentRingRadius).toBeCloseTo(40 * 2.8, 4);

    const midConverge = getBombPhase({ ...bomb, elapsedMs: 175 });
    expect(midConverge.phase).toBe('CONVERGING');
    expect(midConverge.currentRingRadius).toBeCloseTo(40 * 1.9, 4);

    const hold = getBombPhase({ ...bomb, elapsedMs: 400 });
    expect(hold.phase).toBe('HOLD');
    expect(hold.currentRingRadius).toBe(40);

    const active = getBombPhase({ ...bomb, elapsedMs: 1000 });
    expect(active.phase).toBe('ACTIVE');
    expect(active.currentRingRadius).toBe(40);

    const expired = getBombPhase({ ...bomb, elapsedMs: 1400 });
    expect(expired.phase).toBe('EXPIRED');
  });

  it('scales threat level every 15 seconds, shortening spawn intervals and adding hazards', () => {
    const t0 = computeThreatLevel(0);
    const t60 = computeThreatLevel(60_000);
    const t120 = computeThreatLevel(120_000);

    expect(t0.spawnIntervalMs).toBeCloseTo(2600, 1);
    expect(t60.spawnIntervalMs).toBeLessThan(t0.spawnIntervalMs);
    expect(t120.spawnIntervalMs).toBeCloseTo(950, 1);
    expect(t120.laserCount).toBeGreaterThan(t0.laserCount);
    expect(t120.bombCount).toBeGreaterThan(t0.bombCount);
  });

  it('spawns intersecting laser + bullet/bomb tactical patterns and removes expired/offscreen hazards', () => {
    const threat = computeThreatLevel(30_000);
    let seed = 0.25;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const pattern = spawnTacticalPattern(threat, { x: 180, y: 340 }, 'w1', rng);
    expect(pattern.hazards.length).toBeGreaterThanOrEqual(4);
    expect(pattern.hazards.some((h) => h.kind === 'LASER')).toBe(true);

    const stepped = stepHazards(pattern.hazards, 4000);
    expect(stepped.length).toBe(0);
  });
});
