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
import {
  COMBO_HOLD_MS,
  GAME_OVER_EXPLOSION_MS,
  GRAZE_TICK_MS,
  HUD_HEIGHT,
  INITIAL_LIVES,
  INVULNERABLE_MS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type CutInEffect,
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
const DEFAULT_CENTER_Y = HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * 0.6;
const MAX_STEP_DT_MS = 50;
const PEAK_WINDOW_MS = 500;

export function createInitialGameState(): GameState {
  return {
    phase: 'TITLE',
    player: {
      x: DEFAULT_CENTER_X,
      y: DEFAULT_CENTER_Y,
      invulnerableMs: 0,
      trail: [{ x: DEFAULT_CENTER_X, y: DEFAULT_CENTER_Y }],
    },
    hazards: [],
    sparks: [],
    popups: [],
    cutIn: null,
    score: 0,
    comboMultiplier: 1.0,
    maxCombo: 1.0,
    comboGauge: 0,
    totalGrazeCount: 0,
    lives: INITIAL_LIVES,
    survivalTimeMs: 0,
    nextBulletInMs: 120,
    nextLaserInMs: 550,
    nextBombInMs: 1250,
    spawnCounter: 0,
    screenShakeMs: 0,
    hitFlashMs: 0,
    gameOverTimerMs: 0,
    recentScoreSamples: [],
    peakMoment: null,
  };
}

export function startNewGame(prev: GameState): GameState {
  const startPos = clampPlayerPosition(prev.player.x, prev.player.y);
  return {
    ...createInitialGameState(),
    phase: 'PLAYING',
    player: {
      x: startPos.x,
      y: startPos.y,
      invulnerableMs: 0,
      trail: [startPos],
    },
    cutIn: {
      topText: '作戦開始',
      bottomText: '極限接近せよ',
      color: '#ff9900',
      remainingMs: 900,
      totalMs: 900,
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

export function resetPlayerCenter(state: GameState): GameState {
  const center = { x: DEFAULT_CENTER_X, y: DEFAULT_CENTER_Y };
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
  cutIn: CutInEffect | null,
  dtMs: number
): {
  readonly sparks: SparkParticle[];
  readonly popups: ScorePopup[];
  readonly cutIn: CutInEffect | null;
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
        y: p.y - 24 * dtSec,
        remainingMs,
      });
    }
  }

  const nextCutIn =
    cutIn && cutIn.remainingMs - dtMs > 0
      ? { ...cutIn, remainingMs: cutIn.remainingMs - dtMs }
      : null;

  return { sparks: nextSparks, popups: nextPopups, cutIn: nextCutIn };
}

export function stepGame(
  state: GameState,
  rawDtMs: number,
  moveDelta: { readonly dx: number; readonly dy: number },
  rng: () => number = Math.random
): { readonly state: GameState; readonly events: StepEvents } {
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
    const fx = stepVisualEffects(state.sparks, state.popups, state.cutIn, dtMs);
    const remainingTimer = state.gameOverTimerMs - dtMs;

    // Spawn secondary explosion bursts while timer is active
    if (remainingTimer > 400 && Math.floor((remainingTimer + dtMs) / 180) !== Math.floor(remainingTimer / 180)) {
      for (let i = 0; i < 12; i++) {
        const angle = rng() * Math.PI * 2;
        const speed = 40 + rng() * 160;
        fx.sparks.push({
          x: state.player.x + (rng() - 0.5) * 16,
          y: state.player.y + (rng() - 0.5) * 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: i % 2 === 0 ? '#ff3300' : '#ffcc00',
          remainingMs: 650,
          totalMs: 650,
        });
      }
    }

    const finished = remainingTimer <= 0;
    return {
      state: {
        ...state,
        phase: finished ? 'RESULT' : 'GAME_OVER',
        hazards: stepHazards(state.hazards, dtMs * 0.35),
        sparks: fx.sparks,
        popups: fx.popups,
        cutIn: fx.cutIn,
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

  const nextTrail = [clampedPos, ...state.player.trail.slice(0, 11)];

  if (state.phase !== 'PLAYING') {
    const fx = stepVisualEffects(state.sparks, state.popups, state.cutIn, dtMs);
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
        cutIn: fx.cutIn,
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
      const prevPhase = getBombPhase(h).phase;
      const nextPhase = getBombPhase({ ...h, elapsedMs: h.elapsedMs + dtMs }).phase;
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

  let hazards: Hazard[] = [...stepHazards(state.hazards, dtMs)];
  const fx = stepVisualEffects(state.sparks, state.popups, state.cutIn, dtMs);
  let cutIn: CutInEffect | null = fx.cutIn;

  // Independent continuous spawners with randomized jitter so lasers and bombs never lockstep
  const threat = computeThreatLevel(survivalTimeMs);
  let nextBulletInMs = state.nextBulletInMs - dtMs;
  let nextLaserInMs = state.nextLaserInMs - dtMs;
  let nextBombInMs = state.nextBombInMs - dtMs;
  let spawnCounter = state.spawnCounter;
  let spawnedLaserCount = 0;
  let spawnedBombCount = 0;

  if (nextBulletInMs <= 0) {
    spawnCounter += 1;
    const bullets = spawnBulletStream(threat, clampedPos, `s${spawnCounter}`, rng);
    hazards.push(...bullets);
    nextBulletInMs = nextJitteredInterval(threat.bulletIntervalMs, rng);
  }

  if (nextLaserInMs <= 0) {
    spawnCounter += 1;
    const lasers = spawnLaserFormation(threat, `s${spawnCounter}`, rng);
    hazards.push(...lasers);
    spawnedLaserCount = lasers.length;
    nextLaserInMs = nextJitteredInterval(threat.laserIntervalMs, rng);
  }

  if (nextBombInMs <= 0) {
    spawnCounter += 1;
    const bombs = spawnBombCluster(threat, clampedPos, `s${spawnCounter}`, rng);
    hazards.push(...bombs);
    spawnedBombCount = bombs.length;
    nextBombInMs = nextJitteredInterval(threat.bombIntervalMs, rng);
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
      contact: evaluateHazardContact(clampedPos.x, clampedPos.y, hazard),
    }));

    const hasDirectHit = contacts.some((c) => c.contact.kind === 'HIT');

    if (hasDirectHit) {
      directHit = true;
      lives = Math.max(0, lives - 1);
      comboMultiplier = 1.0;
      comboGauge = 0;
      nextInvulnerableMs = INVULNERABLE_MS;
      screenShakeMs = 460;
      hitFlashMs = 380;
      hazards = hazards.map((h) => (h.grazeTimerMs !== 0 ? { ...h, grazeTimerMs: 0 } : h));

      if (lives === 0) {
        playerExploded = true;
        phase = 'GAME_OVER';
        gameOverTimerMs = GAME_OVER_EXPLOSION_MS;
        screenShakeMs = 900;
        hitFlashMs = 700;
        cutIn = {
          topText: '全機喪失・撃墜',
          bottomText: 'SIGNAL LOST',
          color: '#ff2200',
          remainingMs: GAME_OVER_EXPLOSION_MS,
          totalMs: GAME_OVER_EXPLOSION_MS,
        };
        // Massive explosion debris burst from player coordinates
        for (let i = 0; i < 42; i++) {
          const angle = (i / 42) * Math.PI * 2 + (rng() - 0.5) * 0.2;
          const speed = 35 + rng() * 220;
          fx.sparks.push({
            x: clampedPos.x,
            y: clampedPos.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? '#ffcc00' : '#ff3300',
            remainingMs: 1100,
            totalMs: 1100,
          });
        }
      } else if (lives === 1) {
        lastLifeWarning = true;
        cutIn = {
          topText: '最終防衛線・残機壱',
          bottomText: 'WARNING: LAST LIFE',
          color: '#ff0033',
          remainingMs: 1500,
          totalMs: 1500,
        };
      } else {
        cutIn = {
          topText: '直撃・被弾',
          bottomText: 'コンボ消滅',
          color: '#ff2200',
          remainingMs: 950,
          totalMs: 950,
        };
      }
    } else {
      const updatedHazards: Hazard[] = [];
      let activeGrazeSources = 0;

      for (const { hazard, contact } of contacts) {
        if (contact.kind === 'GRAZE') {
          activeGrazeSources += 1;
          let timer = hazard.grazeTimerMs + dtMs;
          while (timer >= GRAZE_TICK_MS) {
            timer -= GRAZE_TICK_MS;
            const reward = computeGrazeTickReward(contact.closeness, comboMultiplier);
            score += reward.scoreDelta;
            frameScoreGain += reward.scoreDelta;
            comboMultiplier = Math.min(999.9, +(comboMultiplier + reward.comboDelta).toFixed(2));
            maxCombo = Math.max(maxCombo, comboMultiplier);
            comboGauge = 1.0;
            totalGrazeCount += 1;
            grazeCount += 1;
            if (reward.isCritical) {
              criticalGrazeCount += 1;
            }

            const sparkBursts = reward.isCritical ? 4 : 2;
            for (let s = 0; s < sparkBursts; s++) {
              const angle = rng() * Math.PI * 2;
              const speed = 70 + rng() * 140;
              fx.sparks.push({
                x: clampedPos.x,
                y: clampedPos.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: reward.isCritical ? '#ffcc00' : '#00ffee',
                remainingMs: 260,
                totalMs: 260,
              });
            }

            if (fx.popups.length < 24) {
              fx.popups.push({
                x: clampedPos.x + (rng() - 0.5) * 32,
                y: clampedPos.y - 16 - rng() * 12,
                text: reward.isCritical ? `極限 +${reward.scoreDelta}!!` : `+${reward.scoreDelta}`,
                color: reward.isCritical ? '#ffcc00' : '#00ffee',
                isCritical: reward.isCritical,
                remainingMs: 520,
              });
            }
          }
          updatedHazards.push({ ...hazard, grazeTimerMs: timer });
        } else {
          updatedHazards.push(
            hazard.grazeTimerMs !== 0 ? { ...hazard, grazeTimerMs: 0 } : hazard
          );
        }
      }
      hazards = updatedHazards;

      if (grazeCount > 0) {
        if (criticalGrazeCount > 0 || activeGrazeSources >= 2) {
          screenShakeMs = Math.max(screenShakeMs, 90);
          cutIn = {
            topText: activeGrazeSources >= 2 ? '多重交差・極限' : '極限接近',
            bottomText: `COMBO ×${comboMultiplier.toFixed(1)}`,
            color: '#ffcc00',
            remainingMs: 420,
            totalMs: 420,
          };
        }
      }
    }
  }

  // Rolling 500ms score-rate window & Peak Moment Snapshot capture
  const cutoffMs = survivalTimeMs - PEAK_WINDOW_MS;
  const recentScoreSamples: ScoreSample[] = state.recentScoreSamples.filter(
    (s) => s.timeMs > cutoffMs
  );
  if (frameScoreGain > 0) {
    recentScoreSamples.push({ timeMs: survivalTimeMs, scoreDelta: frameScoreGain });
  }
  const windowTotalScore = recentScoreSamples.reduce((sum, s) => sum + s.scoreDelta, 0);
  const windowScoreRatePerSec = Math.round(windowTotalScore * (1000 / PEAK_WINDOW_MS));

  const nextSparks = fx.sparks.slice(-110);
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
      comboGauge = Math.max(0, comboGauge - dtMs / COMBO_HOLD_MS);
    } else if (comboMultiplier > 1.0) {
      const excess = comboMultiplier - 1.0;
      const decayPerSec = Math.max(2.0, excess * 0.25);
      comboMultiplier = Math.max(1.0, +(comboMultiplier - decayPerSec * (dtMs / 1000)).toFixed(2));
    }
  }

  return {
    state: {
      phase,
      player: nextPlayer,
      hazards,
      sparks: nextSparks,
      popups: fx.popups,
      cutIn,
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
