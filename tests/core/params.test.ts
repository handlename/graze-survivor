import { describe, expect, it } from 'vitest';
import rawParamsToml from '../../src/config/params.toml?raw';
import { createInitialGameState } from '../../src/core/game';
import { computeGrazeTickReward } from '../../src/core/geometry';
import {
  CONSTANT_BULLET_SPEED,
  computeThreatLevel,
  spawnBombCluster,
  spawnBulletStream,
  spawnLaserFormation,
} from '../../src/core/hazards';
import { GAME_PARAMS, parseGameParams } from '../../src/core/params';
import {
  BASE_TICK_SCORE,
  COMBO_HOLD_MS,
  CORE_RADIUS,
  GAME_OVER_EXPLOSION_MS,
  GRAZE_RADIUS,
  GRAZE_TICK_MS,
  INITIAL_LIVES,
  INVULNERABLE_MS,
} from '../../src/core/types';

describe('game parameters TOML loader and validator', () => {
  it('loads default GAME_PARAMS matching existing game balance constants', () => {
    expect(GAME_PARAMS.player.initialLives).toBe(INITIAL_LIVES);
    expect(GAME_PARAMS.player.invulnerableMs).toBe(INVULNERABLE_MS);
    expect(GAME_PARAMS.player.coreRadius).toBe(CORE_RADIUS);
    expect(GAME_PARAMS.player.grazeRadius).toBe(GRAZE_RADIUS);
    expect(GAME_PARAMS.scoring.grazeTickMs).toBe(GRAZE_TICK_MS);
    expect(GAME_PARAMS.scoring.baseTickScore).toBe(BASE_TICK_SCORE);
    expect(GAME_PARAMS.scoring.comboHoldMs).toBe(COMBO_HOLD_MS);
    expect(GAME_PARAMS.threat.minStartLevel).toBe(-5);
    expect(GAME_PARAMS.threat.maxStartLevel).toBe(10);
    expect(GAME_PARAMS.threat.defaultStartLevel).toBe(0);
    expect(GAME_PARAMS.threat.laserCountLevelOffset).toBe(-1);
    expect(GAME_PARAMS.threat.levelIntervalMs).toBe(15000);
    expect(GAME_PARAMS.threat.maxProgressDurationMs).toBe(120000);
    expect(GAME_PARAMS.bullet.speed).toBe(CONSTANT_BULLET_SPEED);
    expect(GAME_PARAMS.laser.warningDurationMs).toBe(950);
    expect(GAME_PARAMS.bomb.convergeStartRingScale).toBe(2.8);
    expect(GAME_PARAMS.effects.gameOverExplosionMs).toBe(GAME_OVER_EXPLOSION_MS);
  });

  it('propagates customized TOML parameters into threat, hazard spawners, scoring, and initial game state', () => {
    const customToml = rawParamsToml
      .replace(/^initialLives\s*=.*$/m, 'initialLives = 5')
      .replace(/^baseTickScore\s*=.*$/m, 'baseTickScore = 250')
      .replace(/^speed\s*=.*$/m, 'speed = 140')
      .replace(/^radius\s*=.*$/m, 'radius = 6.5')
      .replace(/^warningDurationMs\s*=.*$/gm, 'warningDurationMs = 1200')
      .replace(/^convergeDurationMs\s*=.*$/m, 'convergeDurationMs = 600');
    const customParams = parseGameParams(customToml);

    const state = createInitialGameState(customParams);
    expect(state.lives).toBe(5);

    const reward = computeGrazeTickReward(0, 1.0, customParams);
    expect(reward.scoreDelta).toBe(250);

    const threat = computeThreatLevel(0, customParams);
    expect(threat.bulletSpeed).toBe(140);

    const bullets = spawnBulletStream(threat, { x: 180, y: 300 }, 't', () => 0.1, customParams);
    expect(bullets[0].radius).toBe(6.5);
    expect(Math.hypot(bullets[0].vx, bullets[0].vy)).toBeCloseTo(140, 3);

    const lasers = spawnLaserFormation(threat, 't', () => 0.1, customParams);
    expect(lasers[0].warningDurationMs).toBe(1200);

    const bombs = spawnBombCluster(threat, { x: 180, y: 300 }, 't', () => 0.1, customParams);
    expect(bombs[0].convergeDurationMs).toBe(600);
  });

  it('supports inline comments and numeric underscores when parsing TOML', () => {
    const modified = rawParamsToml.replace(
      /speed\s*=\s*92/,
      'speed = 1_05.5 # custom bullet speed'
    );
    const parsed = parseGameParams(modified);
    expect(parsed.bullet.speed).toBe(105.5);
  });

  it('throws a descriptive error when a required key is missing', () => {
    const withoutSpeed = rawParamsToml.replace(/^speed\s*=.*$/m, '');
    expect(() => parseGameParams(withoutSpeed)).toThrow(/bullet\.speed/);
  });

  it('throws a descriptive error when a value is non-numeric', () => {
    const invalidNumber = rawParamsToml.replace(/^speed\s*=.*$/m, 'speed = fast');
    expect(() => parseGameParams(invalidNumber)).toThrow(/bullet\.speed/);
  });

  it('throws when domain invariants are violated (e.g. non-positive grazeTickMs or grazeRadius <= coreRadius)', () => {
    const zeroTick = rawParamsToml.replace(/^grazeTickMs\s*=.*$/m, 'grazeTickMs = 0');
    expect(() => parseGameParams(zeroTick)).toThrow(/scoring\.grazeTickMs/);

    const invertedRadii = rawParamsToml.replace(/^grazeRadius\s*=.*$/m, 'grazeRadius = 2.0');
    expect(() => parseGameParams(invertedRadii)).toThrow(/grazeRadius/);
  });

  it('throws when an unknown key or section typo is present', () => {
    const withTypo = `${rawParamsToml}\n[bullet]\nsped = 120\n`;
    expect(() => parseGameParams(withTypo)).toThrow(/bullet\.sped/);
  });
});
