import { describe, expect, it } from 'vitest';
import { createInitialGameState, startNewGame, stepGame } from '../../src/core/game';
import type { Hazard } from '../../src/core/types';

describe('core game engine loop', () => {
  it('stacks simultaneous graze ticks across multiple intersecting lasers', () => {
    const initial = startNewGame(createInitialGameState());
    const lasers: Hazard[] = [
      {
        id: 'l1',
        kind: 'LASER',
        x1: 0,
        y1: 300,
        x2: 360,
        y2: 300,
        halfWidth: 5,
        elapsedMs: 800,
        warningDurationMs: 750,
        activeDurationMs: 650,
        grazeTimerMs: 0,
      },
      {
        id: 'l2',
        kind: 'LASER',
        x1: 180,
        y1: 56,
        x2: 180,
        y2: 640,
        halfWidth: 5,
        elapsedMs: 800,
        warningDurationMs: 750,
        activeDurationMs: 650,
        grazeTimerMs: 0,
      },
    ];
    // Place player at (192, 312): 12px from both laser centers -> distanceToEdge = 7px (inside graze ring of both!)
    const stateWithLasers = {
      ...initial,
      player: { ...initial.player, x: 192, y: 312 },
      hazards: lasers,
      nextWaveInMs: 9999,
    };

    const { state: next, events } = stepGame(stateWithLasers, 50, { dx: 0, dy: 0 });
    expect(events.grazeCount).toBe(2);
    expect(next.score).toBeGreaterThan(400);
    expect(next.comboMultiplier).toBeGreaterThan(1.4);
    expect(next.comboGauge).toBe(1.0);
  });

  it('holds comboMultiplier while comboGauge > 0 (1.8s), then decays multiplier toward 1.0', () => {
    const initial = {
      ...startNewGame(createInitialGameState()),
      comboMultiplier: 10.0,
      comboGauge: 1.0,
      nextWaveInMs: 99999,
    };

    // After 900ms (half of 1800ms), gauge is ~0.5 and multiplier is still 10.0
    let current = initial;
    for (let i = 0; i < 18; i++) {
      current = stepGame(current, 50, { dx: 0, dy: 0 }).state;
    }
    expect(current.comboGauge).toBeCloseTo(0.5, 2);
    expect(current.comboMultiplier).toBeCloseTo(10.0, 4);

    // After another 1000ms, gauge hits 0 and multiplier decays below 10.0
    for (let i = 0; i < 20; i++) {
      current = stepGame(current, 50, { dx: 0, dy: 0 }).state;
    }
    expect(current.comboGauge).toBe(0);
    expect(current.comboMultiplier).toBeLessThan(10.0);
    expect(current.comboMultiplier).toBeGreaterThanOrEqual(1.0);
  });

  it('prioritizes Direct Hit over simultaneous Graze on the same frame and triggers game over at 0 lives', () => {
    const initial = startNewGame(createInitialGameState());
    const hazards: Hazard[] = [
      {
        id: 'graze-bullet',
        kind: 'BULLET',
        x: 192,
        y: 350,
        vx: 0,
        vy: 0,
        radius: 3,
        grazeTimerMs: 0,
      },
      {
        id: 'hit-bullet',
        kind: 'BULLET',
        x: 180,
        y: 350,
        vx: 0,
        vy: 0,
        radius: 4,
        grazeTimerMs: 0,
      },
    ];
    const state = {
      ...initial,
      lives: 1,
      comboMultiplier: 15.0,
      comboGauge: 1.0,
      player: { ...initial.player, x: 180, y: 350 },
      hazards,
      nextWaveInMs: 9999,
    };

    const { state: afterHit, events } = stepGame(state, 50, { dx: 0, dy: 0 });
    expect(events.directHit).toBe(true);
    expect(events.grazeCount).toBe(0);
    expect(events.gameOver).toBe(true);
    expect(afterHit.lives).toBe(0);
    expect(afterHit.comboMultiplier).toBe(1.0);
    expect(afterHit.comboGauge).toBe(0);
    expect(afterHit.phase).toBe('RESULT');
  });

  it('clamps huge dtMs spikes (e.g. 3000ms tab switch) to 50ms max step', () => {
    const initial = {
      ...startNewGame(createInitialGameState()),
      comboMultiplier: 8.0,
      comboGauge: 1.0,
      nextWaveInMs: 9999,
    };
    const { state: afterSpike } = stepGame(initial, 3000, { dx: 0, dy: 0 });
    expect(afterSpike.survivalTimeMs).toBe(50);
    expect(afterSpike.comboGauge).toBeGreaterThan(0.95);
  });
});
