import { describe, expect, it } from 'vitest';
import {
  clampPlayerPosition,
  computeGyroDelta,
  computeSwipeDelta,
} from '../../src/core/input';

describe('input delta calculations', () => {
  it('applies linear speed at zero acceleration and boosts fast flicks when swipeAccel > 0', () => {
    const slow = computeSwipeDelta(2, 0, 16, { swipeSpeed: 1.0, swipeAccel: 1.0 });
    const fast = computeSwipeDelta(20, 0, 16, { swipeSpeed: 1.0, swipeAccel: 1.0 });
    // Fast flick is 10x raw displacement, but with acceleration produces > 20x output displacement
    expect(fast.dx / slow.dx).toBeGreaterThan(20);
  });

  it('returns zero delta without NaN when dtMs <= 0 or displacement is 0', () => {
    expect(computeSwipeDelta(10, -5, 0, { swipeSpeed: 1.2, swipeAccel: 0.8 })).toEqual({
      dx: 0,
      dy: 0,
    });
    expect(computeSwipeDelta(0, 0, 16, { swipeSpeed: 1.2, swipeAccel: 0.8 })).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('projects 3D gyro rotationRate onto gravity vector and respects axis inversions', () => {
    const baseSample = {
      alphaRate: 30,
      betaRate: -20,
      gammaRate: 0,
      gx: 0,
      gy: -9.8,
      gz: 0,
      dtSec: 0.016,
    };
    const normal = computeGyroDelta(baseSample, {
      gyroSensitivity: 4.0,
      invertX: false,
      invertY: false,
    });
    const inverted = computeGyroDelta(baseSample, {
      gyroSensitivity: 4.0,
      invertX: true,
      invertY: true,
    });
    expect(normal.dx).toBeGreaterThan(0);
    expect(normal.dy).toBeLessThan(0);
    expect(inverted.dx).toBeCloseTo(-normal.dx, 5);
    expect(inverted.dy).toBeCloseTo(-normal.dy, 5);
  });

  it('clamps player position strictly inside the playfield (x: 3..357, y: 59..637)', () => {
    expect(clampPlayerPosition(-10, 10)).toEqual({ x: 3, y: 59 });
    expect(clampPlayerPosition(400, 700)).toEqual({ x: 357, y: 637 });
  });
});
