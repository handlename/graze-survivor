import { describe, expect, it } from 'vitest';
import rawParamsToml from '../../src/config/params.toml?raw';
import { GAME_PARAMS, parseGameParams } from '../../src/core/params';

describe('game parameters TOML loader and validator', () => {
  it('loads default GAME_PARAMS matching existing game balance constants', () => {
    expect(GAME_PARAMS.player.initialLives).toBe(3);
    expect(GAME_PARAMS.player.coreRadius).toBe(3.0);
    expect(GAME_PARAMS.player.grazeRadius).toBe(24.0);
    expect(GAME_PARAMS.scoring.grazeTickMs).toBe(50);
    expect(GAME_PARAMS.scoring.baseTickScore).toBe(100);
    expect(GAME_PARAMS.threat.levelIntervalMs).toBe(15000);
    expect(GAME_PARAMS.threat.maxProgressDurationMs).toBe(120000);
    expect(GAME_PARAMS.bullet.speed).toBe(92);
    expect(GAME_PARAMS.laser.warningDurationMs).toBe(950);
    expect(GAME_PARAMS.bomb.convergeStartRingScale).toBe(2.8);
    expect(GAME_PARAMS.effects.gameOverExplosionMs).toBe(1600);
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
