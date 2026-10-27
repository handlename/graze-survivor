import { describe, expect, it } from 'vitest';
import { distanceToSegment } from '../../src/core/geometry';
import {
  computeThreatLevel,
  getBombPhase,
  nextJitteredInterval,
  spawnBombCluster,
  spawnBulletStream,
  spawnLaserFormation,
  stepHazards,
} from '../../src/core/hazards';
import { HUD_HEIGHT, LOGICAL_HEIGHT, LOGICAL_WIDTH, type BombHazard } from '../../src/core/types';

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
    expect(lasers[0].warningDurationMs).toBeGreaterThanOrEqual(900);
    expect(bombs[0].convergeDurationMs + bombs[0].holdDurationMs).toBeGreaterThanOrEqual(1050);

    const stepped = stepHazards([...lasers, ...bombs], 4000);
    expect(stepped.length).toBe(0);
  });

  it('clips laser endpoints to playfield bounds, covers 360-degree directions, and supports PINPOINT, PARALLEL, and CAGE formations with >= 30deg intersection angles', () => {
    const acuteIntersectionAngleDeg = (
      a: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number },
      b: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
    ): number => {
      const adx = a.x2 - a.x1;
      const ady = a.y2 - a.y1;
      const bdx = b.x2 - b.x1;
      const bdy = b.y2 - b.y1;
      const dot = Math.abs(adx * bdx + ady * bdy) / (Math.hypot(adx, ady) * Math.hypot(bdx, bdy));
      const clampedDot = Math.max(0, Math.min(1, dot));
      return (Math.acos(clampedDot) * 180) / Math.PI;
    };

    const makeSequenceRng = (firstValues: number[]) => {
      let idx = 0;
      return () => {
        const val = idx < firstValues.length ? firstValues[idx] : 0.5;
        idx++;
        return val;
      };
    };

    // 1. Pattern 0 (PINPOINT): check across laserCount = 2, 3, 4, 5 that all pairs intersect at >= 30 degrees
    for (const count of [2, 3, 4, 5]) {
      const threat = { ...computeThreatLevel(90_000), laserCount: count };
      const pinpointLasers = spawnLaserFormation(
        threat,
        `pin-${count}`,
        makeSequenceRng([0.1, 0.5, 0.5, 0.75, 0.9, 0.1, 0.9, 0.1])
      );
      expect(pinpointLasers).toHaveLength(count);

      const expectedFocusX = 56 + 0.5 * (LOGICAL_WIDTH - 112);
      const arenaTop = HUD_HEIGHT + 64;
      const arenaBottom = LOGICAL_HEIGHT - 64;
      const expectedFocusY = arenaTop + 0.5 * (arenaBottom - arenaTop);

      if (count === 4) {
        // First laser with baseAngleRoll=0.75 points upward (y2 < y1), proving full 0..2PI range
        expect(pinpointLasers[0].y2).toBeLessThan(pinpointLasers[0].y1);
      }

      for (const l of pinpointLasers) {
        expect(l.x1).toBeGreaterThanOrEqual(-1e-4);
        expect(l.x1).toBeLessThanOrEqual(LOGICAL_WIDTH + 1e-4);
        expect(l.y1).toBeGreaterThanOrEqual(HUD_HEIGHT - 1e-4);
        expect(l.y1).toBeLessThanOrEqual(LOGICAL_HEIGHT + 1e-4);
        expect(l.x2).toBeGreaterThanOrEqual(-1e-4);
        expect(l.x2).toBeLessThanOrEqual(LOGICAL_WIDTH + 1e-4);
        expect(l.y2).toBeGreaterThanOrEqual(HUD_HEIGHT - 1e-4);
        expect(l.y2).toBeLessThanOrEqual(LOGICAL_HEIGHT + 1e-4);

        expect(
          distanceToSegment(expectedFocusX, expectedFocusY, l.x1, l.y1, l.x2, l.y2)
        ).toBeLessThan(1e-3);
      }

      // Every pair of lasers in PINPOINT must have an acute intersection angle >= 30 degrees
      for (let i = 0; i < pinpointLasers.length; i++) {
        for (let j = i + 1; j < pinpointLasers.length; j++) {
          expect(acuteIntersectionAngleDeg(pinpointLasers[i], pinpointLasers[j])).toBeGreaterThanOrEqual(
            29.9
          );
        }
      }
    }

    // 2. When laserCount < 3 (e.g., 2 lasers), CAGE is never selected even with patternRoll = 0.85
    const threat2 = { ...computeThreatLevel(0), laserCount: 2 };
    const nonCageAt2 = spawnLaserFormation(
      threat2,
      'two-laser-test',
      makeSequenceRng([0.85, 0.5, 0.5, 0.2])
    );
    expect(nonCageAt2).toHaveLength(2);
    expect(nonCageAt2.every((l) => !l.id.includes('-l-cage-'))).toBe(true);

    // 3. Pattern 1 (PARALLEL, patternRoll = 0.5 at count = 4): parallel lanes with alternating directions
    const threat4 = { ...computeThreatLevel(90_000), laserCount: 4 };
    const parallelLasers = spawnLaserFormation(
      threat4,
      'par',
      makeSequenceRng([0.5, 0.5, 0.5, 0.15])
    );
    expect(parallelLasers).toHaveLength(4);
    for (let i = 0; i < parallelLasers.length - 1; i++) {
      const a = parallelLasers[i];
      const b = parallelLasers[i + 1];
      const adx = a.x2 - a.x1;
      const ady = a.y2 - a.y1;
      const bdx = b.x2 - b.x1;
      const bdy = b.y2 - b.y1;
      const alen = Math.hypot(adx, ady);
      const blen = Math.hypot(bdx, bdy);
      const cosAngle = (adx * bdx + ady * bdy) / (alen * blen);
      expect(cosAngle).toBeCloseTo(-1, 3);
    }

    // 4. Pattern 2 (CAGE, patternRoll = 0.85 at count = 4): tangent polygon around focus point with >= 30deg adjacent angles
    const expectedFocusX = 56 + 0.5 * (LOGICAL_WIDTH - 112);
    const arenaTop = HUD_HEIGHT + 64;
    const arenaBottom = LOGICAL_HEIGHT - 64;
    const expectedFocusY = arenaTop + 0.5 * (arenaBottom - arenaTop);

    const cageLasers = spawnLaserFormation(
      threat4,
      'cage-test',
      makeSequenceRng([0.85, 0.5, 0.5, 0.2])
    );
    expect(cageLasers).toHaveLength(4);
    expect(cageLasers.every((l) => l.id.includes('-l-cage-'))).toBe(true);
    const cageDistances = cageLasers.map((l) =>
      distanceToSegment(expectedFocusX, expectedFocusY, l.x1, l.y1, l.x2, l.y2)
    );
    expect(cageDistances[0]).toBeGreaterThanOrEqual(24);
    for (const d of cageDistances) {
      expect(d).toBeCloseTo(cageDistances[0], 2);
    }
    for (let i = 0; i < cageLasers.length; i++) {
      const next = cageLasers[(i + 1) % cageLasers.length];
      expect(acuteIntersectionAngleDeg(cageLasers[i], next)).toBeGreaterThanOrEqual(29.9);
    }
  });
});
