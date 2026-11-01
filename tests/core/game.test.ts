import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  startNewGame,
  stepGame,
  togglePauseGame,
} from '../../src/core/game';
import {
  clampStartLevel,
  formatStartLevel,
  GAME_TIPS,
  selectPreGameTip,
} from '../../src/core/tips';
import type { BulletHazard, Hazard } from '../../src/core/types';

describe('core game engine loop', () => {
  it('stacks simultaneous graze ticks across multiple intersecting lasers and captures peak moment snapshot', () => {
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
    const stateWithLasers = {
      ...initial,
      player: { ...initial.player, x: 192, y: 312 },
      hazards: lasers,
      nextBulletInMs: 9999,
      nextLaserInMs: 9999,
      nextBombInMs: 9999,
    };

    const { state: next, events } = stepGame(stateWithLasers, 50, { dx: 0, dy: 0 });
    expect(events.grazeCount).toBe(2);
    expect(next.score).toBeGreaterThan(400);
    expect(next.comboMultiplier).toBeGreaterThan(1.4);
    expect(next.comboGauge).toBe(1.0);
    expect(next.peakMoment).not.toBeNull();
    expect(next.peakMoment?.windowScoreRatePerSec).toBeGreaterThan(0);
    expect(next.peakMoment?.hazards.length).toBe(2);
  });

  it('continuously spawns hazards without waiting for existing hazards to disappear', () => {
    const initial = startNewGame(createInitialGameState());
    const existingBullet: Hazard = {
      id: 'existing-1',
      kind: 'BULLET',
      x: 100,
      y: 200,
      vx: 0,
      vy: 50,
      radius: 4,
      elapsedMs: 0,
      warningDurationMs: 550,
      grazeTimerMs: 0,
      grazeCount: 0,
    };
    const readyToSpawn = {
      ...initial,
      hazards: [existingBullet],
      nextBulletInMs: 10,
      nextLaserInMs: 10,
      nextBombInMs: 10,
    };

    const { state: afterStep } = stepGame(readyToSpawn, 20, { dx: 0, dy: 0 });
    expect(afterStep.hazards.some((h) => h.id === 'existing-1')).toBe(true);
    expect(afterStep.hazards.some((h) => h.kind === 'LASER')).toBe(true);
    expect(afterStep.hazards.some((h) => h.kind === 'BOMB')).toBe(true);
    expect(afterStep.hazards.filter((h) => h.kind === 'BULLET').length).toBeGreaterThan(1);
    expect('cutIn' in afterStep).toBe(false);
  });

  it('triggers last-life warning event when reduced to 1 life without cut-in state', () => {
    const initial = startNewGame(createInitialGameState());
    const hitBullet: Hazard = {
      id: 'hit-b',
      kind: 'BULLET',
      x: 180,
      y: 350,
      vx: 0,
      vy: 0,
      radius: 4,
      elapsedMs: 0,
      warningDurationMs: 550,
      grazeTimerMs: 0,
      grazeCount: 0,
    };
    const stateAt2Lives = {
      ...initial,
      lives: 2,
      player: { ...initial.player, x: 180, y: 350 },
      hazards: [hitBullet],
      nextBulletInMs: 9999,
      nextLaserInMs: 9999,
      nextBombInMs: 9999,
    };

    const { state: at1Life, events } = stepGame(stateAt2Lives, 50, { dx: 0, dy: 0 });
    expect(events.directHit).toBe(true);
    expect(events.lastLifeWarning).toBe(true);
    expect(at1Life.lives).toBe(1);
    expect('cutIn' in at1Life).toBe(false);
  });

  it('enters GAME_OVER explosion phase at 0 lives before transitioning to RESULT after explosion timer completes', () => {
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
        elapsedMs: 0,
        warningDurationMs: 550,
        grazeTimerMs: 0,
        grazeCount: 0,
      },
      {
        id: 'hit-bullet',
        kind: 'BULLET',
        x: 180,
        y: 350,
        vx: 0,
        vy: 0,
        radius: 4,
        elapsedMs: 0,
        warningDurationMs: 550,
        grazeTimerMs: 0,
        grazeCount: 0,
      },
    ];
    const state = {
      ...initial,
      lives: 1,
      comboMultiplier: 15.0,
      comboGauge: 1.0,
      player: { ...initial.player, x: 180, y: 350 },
      hazards,
      nextBulletInMs: 9999,
      nextLaserInMs: 9999,
      nextBombInMs: 9999,
    };

    const { state: exploding, events } = stepGame(state, 50, { dx: 0, dy: 0 });
    expect(events.directHit).toBe(true);
    expect(events.grazeCount).toBe(0);
    expect(exploding.lives).toBe(0);
    expect(exploding.phase).toBe('GAME_OVER');
    expect(exploding.gameOverTimerMs).toBeGreaterThan(1000);
    expect(exploding.sparks.length).toBeGreaterThan(20);

    // Step through the explosion lingering duration (~1600ms) until RESULT
    let current = exploding;
    let sawGameOverEvent = false;
    for (let i = 0; i < 40; i++) {
      const res = stepGame(current, 50, { dx: 0, dy: 0 });
      current = res.state;
      if (res.events.gameOver) sawGameOverEvent = true;
    }
    expect(sawGameOverEvent).toBe(true);
    expect(current.phase).toBe('RESULT');
  });

  it('freezes hazard movement, timers, and survival time while PAUSED and resumes cleanly', () => {
    const playing = startNewGame(createInitialGameState());
    const paused = togglePauseGame(playing);
    expect(paused.phase).toBe('PAUSED');

    const { state: whilePaused } = stepGame(paused, 50, { dx: 15, dy: -10 });
    expect(whilePaused.survivalTimeMs).toBe(0);
    expect(whilePaused.player.x).toBe(paused.player.x);

    const resumed = togglePauseGame(whilePaused);
    expect(resumed.phase).toBe('PLAYING');
    const { state: afterResume } = stepGame(resumed, 50, { dx: 0, dy: 0 });
    expect(afterResume.survivalTimeMs).toBe(50);
  });

  it('holds comboMultiplier while comboGauge > 0 (1.8s), then decays multiplier toward 1.0', () => {
    const initial = {
      ...startNewGame(createInitialGameState()),
      comboMultiplier: 10.0,
      comboGauge: 1.0,
      nextBulletInMs: 99999,
      nextLaserInMs: 99999,
      nextBombInMs: 99999,
    };

    let current = initial;
    for (let i = 0; i < 18; i++) {
      current = stepGame(current, 50, { dx: 0, dy: 0 }).state;
    }
    expect(current.comboGauge).toBeCloseTo(0.5, 2);
    expect(current.comboMultiplier).toBeCloseTo(10.0, 4);

    for (let i = 0; i < 20; i++) {
      current = stepGame(current, 50, { dx: 0, dy: 0 }).state;
    }
    expect(current.comboGauge).toBe(0);
    expect(current.comboMultiplier).toBeLessThan(10.0);
    expect(current.comboMultiplier).toBeGreaterThanOrEqual(1.0);
  });

  it('clamps huge dtMs spikes (e.g. 3000ms tab switch) to 50ms max step', () => {
    const initial = {
      ...startNewGame(createInitialGameState()),
      comboMultiplier: 8.0,
      comboGauge: 1.0,
      nextBulletInMs: 9999,
      nextLaserInMs: 9999,
      nextBombInMs: 9999,
    };
    const { state: afterSpike } = stepGame(initial, 3000, { dx: 0, dy: 0 });
    expect(afterSpike.survivalTimeMs).toBe(50);
    expect(afterSpike.comboGauge).toBeGreaterThan(0.95);
  });

  it('selects fixed first-play tip on initial run and random tip from 21 Japanese tips afterwards', () => {
    expect(GAME_TIPS).toHaveLength(21);
    expect(new Set(GAME_TIPS).size).toBe(21);
    expect(GAME_TIPS.some((tip) => tip.includes('通常弾') && tip.includes('上限'))).toBe(true);

    const firstPlayTip = selectPreGameTip(false, () => 0.95);
    expect(firstPlayTip).toBe(GAME_TIPS[0]);
    expect(firstPlayTip).toContain('かすらせる（グレイズする）');

    const subsequentTip = selectPreGameTip(true, () => 0.5);
    expect(subsequentTip).toBe(GAME_TIPS[10]);
  });

  it('clamps startLevel to [-5, 10], formats signed levels, and applies startLevel to stepGame spawning', () => {
    expect(clampStartLevel(-99)).toBe(-5);
    expect(clampStartLevel(99)).toBe(10);
    expect(clampStartLevel(Number.NaN)).toBe(0);
    expect(formatStartLevel(-5)).toBe('-5');
    expect(formatStartLevel(0)).toBe('0');
    expect(formatStartLevel(4)).toBe('+4');

    const started = startNewGame(createInitialGameState(), undefined, -5);
    expect(started.startLevel).toBe(-5);

    const readyToSpawn = {
      ...started,
      nextBulletInMs: 5,
      nextLaserInMs: 5,
      nextBombInMs: 5,
    };

    const { state: afterStep, events } = stepGame(readyToSpawn, 20, { dx: 0, dy: 0 });
    expect(afterStep.startLevel).toBe(-5);
    expect(events.spawnedLaserCount).toBe(0);
    expect(events.spawnedBombCount).toBe(0);
    expect(afterStep.hazards.some((h) => h.kind === 'LASER')).toBe(false);
    expect(afterStep.hazards.some((h) => h.kind === 'BOMB')).toBe(false);
    expect(afterStep.hazards.filter((h) => h.kind === 'BULLET').length).toBeGreaterThanOrEqual(1);
  });

  it('caps bullet graze rewards at maxGrazeTicks (10 ticks) and ceases combo refresh', () => {
    const initial = startNewGame(createInitialGameState());
    const bullet: BulletHazard = {
      id: 'test-bullet',
      kind: 'BULLET',
      x: 100,
      y: 200,
      vx: 0,
      vy: 0,
      radius: 4,
      elapsedMs: 10,
      warningDurationMs: 550,
      grazeTimerMs: 0,
      grazeCount: 9, // 1 tick away from cap (10)
    };

    const stateNearCap = {
      ...initial,
      player: { ...initial.player, x: 100, y: 208 },
      hazards: [bullet],
      nextBulletInMs: 9999,
      nextLaserInMs: 9999,
      nextBombInMs: 9999,
    };

    // 150ms step = normally 3 ticks, but only 1 remaining before cap of 10
    const { state: afterOneTickStep, events: events1 } = stepGame(stateNearCap, 150, { dx: 0, dy: 0 });
    expect(events1.grazeCount).toBe(1);
    const bulletAfter1 = afterOneTickStep.hazards.find((h) => h.id === 'test-bullet') as BulletHazard;
    expect(bulletAfter1.grazeCount).toBe(10);

    const scoreAtCap = afterOneTickStep.score;
    const comboAtCap = afterOneTickStep.comboMultiplier;

    // Next step of 100ms: should yield 0 graze ticks, score and combo remain unchanged
    const { state: afterExhaustedStep, events: events2 } = stepGame(afterOneTickStep, 100, { dx: 0, dy: 0 });
    expect(events2.grazeCount).toBe(0);
    expect(afterExhaustedStep.score).toBe(scoreAtCap);
    expect(afterExhaustedStep.comboMultiplier).toBe(comboAtCap);
  });
});
