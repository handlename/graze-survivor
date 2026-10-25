import { describe, expect, it } from 'vitest';
import {
  computeThreatLevel,
  getBombPhase,
  spawnBulletStream,
  spawnBombCluster,
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

  it('keeps bullet speed slow and constant across threat levels while increasing bullet count and shortening intervals', () => {
    const t0 = computeThreatLevel(0);
    const t120 = computeThreatLevel(120_000);

    expect(t0.bulletSpeed).toBe(t120.bulletSpeed);
    expect(t0.bulletSpeed).toBeLessThanOrEqual(110);
    expect(t120.bulletsPerStream).toBeGreaterThan(t0.bulletsPerStream);
    expect(t120.bulletIntervalMs).toBeLessThan(t0.bulletIntervalMs);
    expect(t120.laserIntervalMs).toBeLessThan(t0.laserIntervalMs);
    expect(t120.bombIntervalMs).toBeLessThan(t0.bombIntervalMs);

    let seed = 0.3;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const stream0 = spawnBulletStream(t0, { x: 180, y: 340 }, 's0', rng);
    const stream120 = spawnBulletStream(t120, { x: 180, y: 340 }, 's120', rng);

    expect(stream120.length).toBeGreaterThan(stream0.length);
    const speed0 = Math.hypot(stream0[0].vx, stream0[0].vy);
    const speed120 = Math.hypot(stream120[0].vx, stream120[0].vy);
    expect(speed0).toBeCloseTo(speed120, 4);
    expect(speed0).toBeLessThanOrEqual(115);
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
