import { describe, expect, it } from 'vitest';
import { computeBulletTelegraphProjection, renderBulletHazard } from '../src/shell/renderer';
import type { BulletHazard } from '../src/core/types';

describe('computeBulletTelegraphProjection & renderBulletHazard', () => {
  it('separates collinear staggered bullets along their velocity vector during telegraph', () => {
    const frontBullet: BulletHazard = {
      id: 'b-0',
      kind: 'BULLET',
      x: 180,
      y: 74,
      vx: 0,
      vy: 92,
      radius: 4,
      elapsedMs: -275,
      warningDurationMs: 550,
      grazeTimerMs: 0,
    };
    const backBullet: BulletHazard = {
      id: 'b-1',
      kind: 'BULLET',
      x: 180,
      y: 74,
      vx: 0,
      vy: 92,
      radius: 4,
      elapsedMs: -365,
      warningDurationMs: 640,
      grazeTimerMs: 0,
    };

    const p0 = computeBulletTelegraphProjection(frontBullet);
    const p1 = computeBulletTelegraphProjection(backBullet);

    expect(p0.gx).toBe(180);
    expect(p1.gx).toBe(180);
    expect(p0.gy).toBeGreaterThan(frontBullet.y);
    expect(p1.gy).not.toBeCloseTo(p0.gy, 2);
  });

  it('activates snap state when progress exceeds bulletTelegraphSnapThreshold and renders both WARNING and ACTIVE bullets', () => {
    const imminentBullet: BulletHazard = {
      id: 'b-imm',
      kind: 'BULLET',
      x: 180,
      y: 200,
      vx: 92,
      vy: 0,
      radius: 4,
      elapsedMs: -50,
      warningDurationMs: 550,
      grazeTimerMs: 0,
    };
    const proj = computeBulletTelegraphProjection(imminentBullet);
    expect(proj.progress).toBeGreaterThan(0.78);
    expect(proj.isSnap).toBe(true);

    let arcCount = 0;
    let strokeCount = 0;
    const mockCtx = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {
        arcCount++;
      },
      stroke: () => {
        strokeCount++;
      },
      fill: () => {},
    } as unknown as CanvasRenderingContext2D;

    renderBulletHazard(mockCtx, imminentBullet);
    expect(strokeCount).toBeGreaterThanOrEqual(2);
    expect(arcCount).toBe(1);

    arcCount = 0;
    renderBulletHazard(mockCtx, { ...imminentBullet, elapsedMs: 10 });
    expect(arcCount).toBe(2);
  });
});
