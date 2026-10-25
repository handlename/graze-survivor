import { describe, expect, it } from 'vitest';
import {
  computeThreatLevel,
  getBombPhase,
  nextJitteredInterval,
  spawnBombCluster,
  spawnBulletStream,
  spawnLaserFormation,
  stepHazards,
} from '../../src/core/hazards';
import type { BombHazard } from '../../src/core/types';

describe('hazards lifecycle and continuous spawners', () => {
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

  it('keeps bullet speed slow and constant across threat levels while increasing bullet count and varying bullet patterns', () => {
    const t0 = computeThreatLevel(0);
    const t120 = computeThreatLevel(120_000);

    expect(t0.bulletSpeed).toBe(t120.bulletSpeed);
    expect(t0.bulletSpeed).toBeLessThanOrEqual(110);
    expect(t120.bulletsPerStream).toBeGreaterThan(t0.bulletsPerStream);

    // Verify all 4 bullet pattern variations (0: LINE, 1: FAN, 2: SPIRAL, 3: CROSS) produce constant-speed bullets
    for (const patternRoll of [0.1, 0.35, 0.6, 0.85]) {
      const rng = () => patternRoll;
      const bullets = spawnBulletStream(t0, { x: 180, y: 340 }, `p-${patternRoll}`, rng);
      expect(bullets.length).toBeGreaterThanOrEqual(t0.bulletsPerStream);
      for (const b of bullets) {
        expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(t0.bulletSpeed, 3);
      }
    }
  });

  it('randomizes laser and bomb spawn intervals with jitter so their timings desynchronize', () => {
    const low = nextJitteredInterval(1000, () => 0.0);
    const high = nextJitteredInterval(1000, () => 1.0);
    expect(low).toBeLessThan(800);
    expect(high).toBeGreaterThan(1200);
    expect(low).not.toBe(high);
  });

  it('spawns continuous laser formations and bomb clusters and removes expired hazards', () => {
    const threat = computeThreatLevel(30_000);
    let seed = 0.25;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const lasers = spawnLaserFormation(threat, 'l', rng);
    const bombs = spawnBombCluster(threat, { x: 180, y: 340 }, 'b', rng);
    expect(lasers.length).toBeGreaterThanOrEqual(2);
    expect(bombs.length).toBeGreaterThanOrEqual(1);

    const stepped = stepHazards([...lasers, ...bombs], 4000);
    expect(stepped.length).toBe(0);
  });
});
