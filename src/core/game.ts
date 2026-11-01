import { computeGrazeTickReward, evaluateHazardContact } from './geometry';
import {
  computeThreatLevel,
  getBombPhase,
  getLaserPhase,
  nextJitteredInterval,
  spawnBombCluster,
  spawnBulletStream,
  spawnLaserFormation,
  stepHazards,
} from './hazards';
import { clampPlayerPosition } from './input';
import { GAME_PARAMS, type GameParams } from './params';
import { clampStartLevel } from './tips';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type GamePhase,
  type GameState,
  type Hazard,
  type PeakMomentSnapshot,
  type ScorePopup,
  type ScoreSample,
  type SparkParticle,
} from './types';

export interface StepEvents {
  readonly grazeCount: number;
  readonly criticalGrazeCount: number;
  readonly directHit: boolean;
  readonly lastLifeWarning: boolean;
  readonly playerExploded: boolean;
  readonly gameOver: boolean;
  readonly spawnedLaserCount: number;
  readonly spawnedBombCount: number;
  readonly bombDetonatedCount: number;
  readonly laserActivatedCount: number;
}

const DEFAULT_CENTER_X = LOGICAL_WIDTH / 2;
const MAX_STEP_DT_MS = 50;

function getDefaultCenterY(params: GameParams = GAME_PARAMS): number {
  return HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * params.player.defaultCenterYRatio;
}

export function createInitialGameState(
  params: GameParams = GAME_PARAMS,
  startLevel = params.threat.defaultStartLevel
): GameState {
  const centerY = getDefaultCenterY(params);
  return {
    phase: 'TITLE',
    startLevel: clampStartLevel(startLevel, params),
    player: {
      x: DEFAULT_CENTER_X,
      y: centerY,
      invulnerableMs: 0,
      trail: [{ x: DEFAULT_CENTER_X, y: centerY }],
    },
    hazards: [],
    sparks: [],
    popups: [],
    score: 0,
    comboMultiplier: 1.0,
    maxCombo: 1.0,
    comboGauge: 0,
    totalGrazeCount: 0,
    lives: params.player.initialLives,
    survivalTimeMs: 0,
    nextBulletInMs: params.threat.initialBulletDelayMs,
    nextLaserInMs: params.threat.initialLaserDelayMs,
    nextBombInMs: params.threat.initialBombDelayMs,
    spawnCounter: 0,
    screenShakeMs: 0,
    hitFlashMs: 0,
    gameOverTimerMs: 0,
    recentScoreSamples: [],
    peakMoment: null,
  };
}

export function startNewGame(
  prev: GameState,
  params: GameParams = GAME_PARAMS,
  startLevel = prev.startLevel
): GameState {
  const startPos = clampPlayerPosition(prev.player.x, prev.player.y);
  return {
    ...createInitialGameState(params, startLevel),
    phase: 'PLAYING',
    player: {
      x: startPos.x,
      y: startPos.y,
      invulnerableMs: 0,
      trail: [startPos],
    },
  };
}

export function togglePauseGame(state: GameState): GameState {
  if (state.phase === 'PLAYING') {
    return { ...state, phase: 'PAUSED' };
  }
  if (state.phase === 'PAUSED') {
    return { ...state, phase: 'PLAYING' };
  }
  return state;
}

export function resetPlayerCenter(state: GameState, params: GameParams = GAME_PARAMS): GameState {
  const center = { x: DEFAULT_CENTER_X, y: getDefaultCenterY(params) };
  return {
    ...state,
    player: {
      ...state.player,
      x: center.x,
      y: center.y,
      trail: [center],
    },
  };
}

function stepVisualEffects(
  sparks: readonly SparkParticle[],
  popups: readonly ScorePopup[],
  dtMs: number,
  params: GameParams = GAME_PARAMS
): {
  readonly sparks: SparkParticle[];
  readonly popups: ScorePopup[];
} {
  const dtSec = dtMs / 1000;
  const nextSparks: SparkParticle[] = [];
  for (const s of sparks) {
    const remainingMs = s.remainingMs - dtMs;
    if (remainingMs > 0) {
      nextSparks.push({
        ...s,
        x: s.x + s.vx * dtSec,
        y: s.y + s.vy * dtSec,
        remainingMs,
      });
    }
  }

  const nextPopups: ScorePopup[] = [];
  for (const p of popups) {
    const remainingMs = p.remainingMs - dtMs;
    if (remainingMs > 0) {
      nextPopups.push({
        ...p,
        y: p.y - params.effects.popupRiseSpeedPxPerSec * dtSec,
        remainingMs,
      });
    }
  }

  return { sparks: nextSparks, popups: nextPopups };
}

export function stepGame(
  state: GameState,
  rawDtMs: number,
  moveDelta: { readonly dx: number; readonly dy: number },
  rng: () => number = Math.random,
  params: GameParams = GAME_PARAMS
): { readonly state: GameState; readonly events: StepEvents } {
  const { player: playerCfg, scoring, effects } = params;
  const emptyEvents: StepEvents = {
    grazeCount: 0,
    criticalGrazeCount: 0,
    directHit: false,
    lastLifeWarning: false,
    playerExploded: false,
    gameOver: false,
    spawnedLaserCount: 0,
    spawnedBombCount: 0,
    bombDetonatedCount: 0,
    laserActivatedCount: 0,
  };

  if (state.phase === 'PAUSED') {
    return { state, events: emptyEvents };
  }

  const dtMs = Math.max(0, Math.min(MAX_STEP_DT_MS, rawDtMs));

  // Lingering player explosion phase before transitioning to RESULT
  if (state.phase === 'GAME_OVER') {
    const fx = stepVisualEffects(state.sparks, state.popups, dtMs, params);
    const remainingTimer = state.gameOverTimerMs - dtMs;

    // Spawn secondary explosion bursts while timer is active
    if (
      remainingTimer > effects.secondaryBurstCutoffMs &&
      Math.floor((remainingTimer + dtMs) / effects.secondaryBurstIntervalMs) !==
        Math.floor(remainingTimer / effects.secondaryBurstIntervalMs)
    ) {
      for (let i = 0; i < effects.secondaryBurstSparkCount; i++) {
        const angle = rng() * Math.PI * 2;
        const speed =
          effects.secondaryBurstMinSpeed + rng() * effects.secondaryBurstSpeedRange;
        fx.sparks.push({
          x: state.player.x + (rng() - 0.5) * effects.secondaryBurstSpreadPx,
          y: state.player.y + (rng() - 0.5) * effects.secondaryBurstSpreadPx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: i % 2 === 0 ? '#E62E2E' : '#111111',
          remainingMs: effects.secondaryBurstSparkDurationMs,
          totalMs: effects.secondaryBurstSparkDurationMs,
        });
      }
    }

    const finished = remainingTimer <= 0;
    return {
      state: {
        ...state,
        phase: finished ? 'RESULT' : 'GAME_OVER',
        hazards: stepHazards(state.hazards, dtMs * effects.gameOverHazardSlowFactor, params),
        sparks: fx.sparks,
        popups: fx.popups,
        gameOverTimerMs: Math.max(0, remainingTimer),
        screenShakeMs: Math.max(0, state.screenShakeMs - dtMs),
        hitFlashMs: Math.max(0, state.hitFlashMs - dtMs),
      },
      events: {
        ...emptyEvents,
        gameOver: finished,
      },
    };
  }

  const clampedPos = clampPlayerPosition(
    state.player.x + moveDelta.dx,
    state.player.y + moveDelta.dy
  );

  const maxTrailPrev = Math.max(0, Math.floor(effects.playerTrailLength) - 1);
  const nextTrail = [clampedPos, ...state.player.trail.slice(0, maxTrailPrev)];

  if (state.phase !== 'PLAYING') {
    const fx = stepVisualEffects(state.sparks, state.popups, dtMs, params);
    return {
      state: {
        ...state,
        player: {
          ...state.player,
          x: clampedPos.x,
          y: clampedPos.y,
          trail: nextTrail,
        },
        sparks: fx.sparks,
        popups: fx.popups,
        screenShakeMs: Math.max(0, state.screenShakeMs - dtMs),
        hitFlashMs: Math.max(0, state.hitFlashMs - dtMs),
      },
      events: emptyEvents,
    };
  }

  const survivalTimeMs = state.survivalTimeMs + dtMs;
  const invulnerableMs = Math.max(0, state.player.invulnerableMs - dtMs);

  let bombDetonatedCount = 0;
  let laserActivatedCount = 0;
  for (const h of state.hazards) {
    if (h.kind === 'BOMB') {
      const prevPhase = getBombPhase(h, params).phase;
      const nextPhase = getBombPhase({ ...h, elapsedMs: h.elapsedMs + dtMs }, params).phase;
      if (prevPhase !== 'ACTIVE' && nextPhase === 'ACTIVE') {
        bombDetonatedCount++;
      }
    } else if (h.kind === 'LASER') {
      const prevPhase = getLaserPhase(h);
      const nextPhase = getLaserPhase({ ...h, elapsedMs: h.elapsedMs + dtMs });
      if (prevPhase !== 'ACTIVE' && nextPhase === 'ACTIVE') {
        laserActivatedCount++;
      }
    }
  }

  let hazards: Hazard[] = [...stepHazards(state.hazards, dtMs, params)];
  const fx = stepVisualEffects(state.sparks, state.popups, dtMs, params);

  // Independent continuous spawners with randomized jitter so lasers and bombs never lockstep
  const threat = computeThreatLevel(survivalTimeMs, params, state.startLevel);
  let nextBulletInMs = state.nextBulletInMs - dtMs;
  let nextLaserInMs = state.nextLaserInMs - dtMs;
  let nextBombInMs = state.nextBombInMs - dtMs;
  let spawnCounter = state.spawnCounter;
  let spawnedLaserCount = 0;
  let spawnedBombCount = 0;

  if (nextBulletInMs <= 0) {
    spawnCounter += 1;
    const bullets = spawnBulletStream(threat, clampedPos, `s${spawnCounter}`, rng, params);
    hazards.push(...bullets);
    nextBulletInMs = nextJitteredInterval(threat.bulletIntervalMs, rng, params);
  }

  if (nextLaserInMs <= 0) {
    spawnCounter += 1;
    const lasers = spawnLaserFormation(threat, `s${spawnCounter}`, rng, params);
    hazards.push(...lasers);
    spawnedLaserCount = lasers.length;
    nextLaserInMs = nextJitteredInterval(threat.laserIntervalMs, rng, params);
  }

  if (nextBombInMs <= 0) {
    spawnCounter += 1;
    const bombs = spawnBombCluster(threat, clampedPos, `s${spawnCounter}`, rng, params);
    hazards.push(...bombs);
    spawnedBombCount = bombs.length;
    nextBombInMs = nextJitteredInterval(threat.bombIntervalMs, rng, params);
  }

  let score = state.score;
  let comboMultiplier = state.comboMultiplier;
  let maxCombo = state.maxCombo;
  let comboGauge = state.comboGauge;
  let totalGrazeCount = state.totalGrazeCount;
  let lives = state.lives;
  let phase: GamePhase = state.phase;
  let nextInvulnerableMs = invulnerableMs;
  let screenShakeMs = Math.max(0, state.screenShakeMs - dtMs);
  let hitFlashMs = Math.max(0, state.hitFlashMs - dtMs);
  let gameOverTimerMs = state.gameOverTimerMs;

  let grazeCount = 0;
  let criticalGrazeCount = 0;
  let directHit = false;
  let lastLifeWarning = false;
  let playerExploded = false;
  let frameScoreGain = 0;

  if (invulnerableMs === 0) {
    const contacts = hazards.map((hazard) => ({
      hazard,
      contact: evaluateHazardContact(clampedPos.x, clampedPos.y, hazard, params),
    }));

    const hasDirectHit = contacts.some((c) => c.contact.kind === 'HIT');

    if (hasDirectHit) {
      directHit = true;
      lives = Math.max(0, lives - 1);
      comboMultiplier = 1.0;
      comboGauge = 0;
      nextInvulnerableMs = playerCfg.invulnerableMs;
      screenShakeMs = effects.hitScreenShakeMs;
      hitFlashMs = effects.hitFlashMs;
      hazards = hazards.map((h) => (h.grazeTimerMs !== 0 ? { ...h, grazeTimerMs: 0 } : h));

      if (lives === 0) {
        playerExploded = true;
        phase = 'GAME_OVER';
        gameOverTimerMs = effects.gameOverExplosionMs;
        screenShakeMs = effects.gameOverScreenShakeMs;
        hitFlashMs = effects.gameOverHitFlashMs;
        // Massive explosion debris burst from player coordinates
        for (let i = 0; i < effects.deathBurstSparkCount; i++) {
          const angle =
            (i / effects.deathBurstSparkCount) * Math.PI * 2 + (rng() - 0.5) * 0.2;
          const speed = effects.deathBurstMinSpeed + rng() * effects.deathBurstSpeedRange;
          fx.sparks.push({
            x: clampedPos.x,
            y: clampedPos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: i % 2 === 0 ? '#E62E2E' : '#111111',
            remainingMs: effects.deathBurstSparkDurationMs,
            totalMs: effects.deathBurstSparkDurationMs,
          });
        }
      } else if (lives === 1) {
        lastLifeWarning = true;
      }
    } else {
      const updatedHazards: Hazard[] = [];
      let activeGrazeSources = 0;

      for (const { hazard, contact } of contacts) {
        if (contact.kind === 'GRAZE') {
          activeGrazeSources += 1;
          let timer = hazard.grazeTimerMs + dtMs;
          let currentGrazeCount = hazard.kind === 'BULLET' ? hazard.grazeCount : 0;
          const maxTicks = hazard.kind === 'BULLET' ? params.bullet.maxGrazeTicks : Infinity;

          while (timer >= scoring.grazeTickMs && currentGrazeCount < maxTicks) {
            timer -= scoring.grazeTickMs;
            if (hazard.kind === 'BULLET') {
              currentGrazeCount += 1;
            }
            const reward = computeGrazeTickReward(
              contact.closeness,
              comboMultiplier,
              params,
              threat.level
            );
            score += reward.scoreDelta;
            frameScoreGain += reward.scoreDelta;
            comboMultiplier = Math.min(
              scoring.maxComboMultiplier,
              +(comboMultiplier + reward.comboDelta).toFixed(2)
            );
            maxCombo = Math.max(maxCombo, comboMultiplier);
            comboGauge = 1.0;
            totalGrazeCount += 1;
            grazeCount += 1;
            if (reward.isCritical) {
              criticalGrazeCount += 1;
            }

            const sparkBursts = reward.isCritical
              ? effects.grazeSparksCritical
              : effects.grazeSparksNormal;
            for (let s = 0; s < sparkBursts; s++) {
              const angle = rng() * Math.PI * 2;
              const speed =
                effects.grazeSparkMinSpeed + rng() * effects.grazeSparkSpeedRange;
              fx.sparks.push({
                x: clampedPos.x,
                y: clampedPos.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: reward.isCritical ? '#E62E2E' : '#111111',
                remainingMs: effects.grazeSparkDurationMs,
                totalMs: effects.grazeSparkDurationMs,
              });
            }

            if (fx.popups.length < effects.maxPopups) {
              fx.popups.push({
                x: clampedPos.x + (rng() - 0.5) * 32,
                y: clampedPos.y - 16 - rng() * 12,
                text: `+${reward.scoreDelta}`,
                color: reward.isCritical ? '#E62E2E' : '#111111',
                isCritical: reward.isCritical,
                remainingMs: effects.popupDurationMs,
              });
            }
          }

          if (hazard.kind === 'BULLET' && currentGrazeCount >= maxTicks) {
            timer = 0;
          }

          updatedHazards.push(
            hazard.kind === 'BULLET'
              ? { ...hazard, grazeTimerMs: timer, grazeCount: currentGrazeCount }
              : { ...hazard, grazeTimerMs: timer }
          );
        } else {
          updatedHazards.push(
            hazard.grazeTimerMs !== 0 ? { ...hazard, grazeTimerMs: 0 } : hazard
          );
        }
      }
      hazards = updatedHazards;

      if (grazeCount > 0 && (criticalGrazeCount > 0 || activeGrazeSources >= 2)) {
        screenShakeMs = Math.max(screenShakeMs, effects.grazeScreenShakeMs);
      }
    }
  }

  // Rolling score-rate window & Peak Moment Snapshot capture
  const cutoffMs = survivalTimeMs - scoring.peakWindowMs;
  const recentScoreSamples: ScoreSample[] = state.recentScoreSamples.filter(
    (s) => s.timeMs > cutoffMs
  );
  if (frameScoreGain > 0) {
    recentScoreSamples.push({ timeMs: survivalTimeMs, scoreDelta: frameScoreGain });
  }
  const windowTotalScore = recentScoreSamples.reduce((sum, s) => sum + s.scoreDelta, 0);
  const windowScoreRatePerSec = Math.round(windowTotalScore * (1000 / scoring.peakWindowMs));

  const nextSparks = fx.sparks.slice(-effects.maxSparks);
  const nextPlayer = {
    x: clampedPos.x,
    y: clampedPos.y,
    invulnerableMs: nextInvulnerableMs,
    trail: nextTrail,
  };

  let peakMoment: PeakMomentSnapshot | null = state.peakMoment;
  if (
    frameScoreGain > 0 &&
    (!peakMoment || windowScoreRatePerSec >= peakMoment.windowScoreRatePerSec)
  ) {
    peakMoment = {
      timeMs: survivalTimeMs,
      windowScoreRatePerSec,
      comboMultiplier,
      player: nextPlayer,
      hazards,
      sparks: nextSparks,
      popups: fx.popups,
    };
  }

  if (!directHit && grazeCount === 0) {
    if (comboGauge > 0) {
      comboGauge = Math.max(0, comboGauge - dtMs / scoring.comboHoldMs);
    } else if (comboMultiplier > 1.0) {
      const excess = comboMultiplier - 1.0;
      const decayPerSec = Math.max(
        scoring.comboDecayMinPerSec,
        excess * scoring.comboDecayExcessFactor
      );
      comboMultiplier = Math.max(1.0, +(comboMultiplier - decayPerSec * (dtMs / 1000)).toFixed(2));
    }
  }

  return {
    state: {
      phase,
      startLevel: state.startLevel,
      player: nextPlayer,
      hazards,
      sparks: nextSparks,
      popups: fx.popups,
      score,
      comboMultiplier,
      maxCombo,
      comboGauge,
      totalGrazeCount,
      lives,
      survivalTimeMs,
      nextBulletInMs,
      nextLaserInMs,
      nextBombInMs,
      spawnCounter,
      screenShakeMs,
      hitFlashMs,
      gameOverTimerMs,
      recentScoreSamples,
      peakMoment,
    },
    events: {
      grazeCount,
      criticalGrazeCount,
      directHit,
      lastLifeWarning,
      playerExploded,
      gameOver: false,
      spawnedLaserCount,
      spawnedBombCount,
      bombDetonatedCount,
      laserActivatedCount,
    },
  };
}
