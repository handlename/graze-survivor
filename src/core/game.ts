import { computeGrazeTickReward, evaluateHazardContact } from './geometry';
import {
  computeThreatLevel,
  getBombPhase,
  getLaserPhase,
  spawnTacticalPattern,
  stepHazards,
} from './hazards';
import { clampPlayerPosition } from './input';
import {
  COMBO_HOLD_MS,
  GRAZE_TICK_MS,
  HUD_HEIGHT,
  INITIAL_LIVES,
  INVULNERABLE_MS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type CutInEffect,
  type GamePhase,
  type GameState,
  type GrazeSample,
  type Hazard,
  type ScorePopup,
  type SparkParticle,
  type Vector2D,
} from './types';

export interface StepEvents {
  readonly grazeCount: number;
  readonly criticalGrazeCount: number;
  readonly directHit: boolean;
  readonly gameOver: boolean;
  readonly spawnedLaserCount: number;
  readonly spawnedBombCount: number;
  readonly bombDetonatedCount: number;
  readonly laserActivatedCount: number;
}

const DEFAULT_CENTER_X = LOGICAL_WIDTH / 2;
const DEFAULT_CENTER_Y = HUD_HEIGHT + (LOGICAL_HEIGHT - HUD_HEIGHT) * 0.6;
const MAX_STEP_DT_MS = 50;

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
    nextWaveInMs: 400,
    waveCounter: 0,
    screenShakeMs: 0,
    hitFlashMs: 0,
    traceLog: [{ x: DEFAULT_CENTER_X, y: DEFAULT_CENTER_Y }],
    grazeLog: [],
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
    traceLog: [startPos],
  };
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
  const dtMs = Math.max(0, Math.min(MAX_STEP_DT_MS, rawDtMs));
  const clampedPos = clampPlayerPosition(
    state.player.x + moveDelta.dx,
    state.player.y + moveDelta.dy
  );

  const nextTrail = [clampedPos, ...state.player.trail.slice(0, 11)];

  const emptyEvents: StepEvents = {
    grazeCount: 0,
    criticalGrazeCount: 0,
    directHit: false,
    gameOver: false,
    spawnedLaserCount: 0,
    spawnedBombCount: 0,
    bombDetonatedCount: 0,
    laserActivatedCount: 0,
  };

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

  // Detect bomb detonations and laser activations across this step
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

  // Wave spawning
  let nextWaveInMs = state.nextWaveInMs - dtMs;
  let waveCounter = state.waveCounter;
  let spawnedLaserCount = 0;
  let spawnedBombCount = 0;

  if (nextWaveInMs <= 0) {
    const threat = computeThreatLevel(survivalTimeMs);
    waveCounter += 1;
    const spawned = spawnTacticalPattern(threat, clampedPos, `w${waveCounter}`, rng);
    hazards.push(...spawned.hazards);
    spawnedLaserCount = spawned.hazards.filter((h) => h.kind === 'LASER').length;
    spawnedBombCount = spawned.hazards.filter((h) => h.kind === 'BOMB').length;
    nextWaveInMs = threat.spawnIntervalMs;

    if (!cutIn) {
      cutIn = {
        topText: spawned.cutInText,
        bottomText: `THREAT LV.${threat.level + 1}`,
        color: '#ff4400',
        remainingMs: 750,
        totalMs: 750,
      };
    }
  }

  // Record trace log every ~100ms or significant move
  const lastTrace = state.traceLog[state.traceLog.length - 1];
  const traceLog: Vector2D[] =
    !lastTrace || Math.hypot(clampedPos.x - lastTrace.x, clampedPos.y - lastTrace.y) >= 5
      ? [...state.traceLog.slice(-240), clampedPos]
      : [...state.traceLog];

  // Evaluate contacts when not invulnerable
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

  let grazeCount = 0;
  let criticalGrazeCount = 0;
  let directHit = false;
  let gameOver = false;
  const grazeLog: GrazeSample[] = [...state.grazeLog];

  if (invulnerableMs === 0) {
    const contacts = hazards.map((hazard) => ({
      hazard,
      contact: evaluateHazardContact(clampedPos.x, clampedPos.y, hazard),
    }));

    // Precedence Rule: Direct Hit takes absolute priority over simultaneous Graze on the same frame
    const hasDirectHit = contacts.some((c) => c.contact.kind === 'HIT');

    if (hasDirectHit) {
      directHit = true;
      lives = Math.max(0, lives - 1);
      comboMultiplier = 1.0;
      comboGauge = 0;
      nextInvulnerableMs = INVULNERABLE_MS;
      screenShakeMs = 420;
      hitFlashMs = 360;

      if (lives === 0) {
        gameOver = true;
        phase = 'RESULT';
        cutIn = {
          topText: '作戦終了・全機喪失',
          bottomText: 'OPERATION TERMINATED',
          color: '#ff2200',
          remainingMs: 2000,
          totalMs: 2000,
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
      // Process continuous graze ticks for all hazards in GRAZE ring
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
            comboMultiplier = Math.min(999.9, +(comboMultiplier + reward.comboDelta).toFixed(2));
            maxCombo = Math.max(maxCombo, comboMultiplier);
            comboGauge = 1.0;
            totalGrazeCount += 1;
            grazeCount += 1;
            if (reward.isCritical) {
              criticalGrazeCount += 1;
            }

            if (grazeLog.length < 300) {
              grazeLog.push({
                x: clampedPos.x,
                y: clampedPos.y,
                isCritical: reward.isCritical,
              });
            }

            // Spawn sparks
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

            // Spawn score popup
            if (fx.popups.length < 24) {
              fx.popups.push({
                x: clampedPos.x + (rng() - 0.5) * 32,
                y: clampedPos.y - 14 - rng() * 12,
                text: reward.isCritical ? `極限 +${reward.scoreDelta}!!` : `+${reward.scoreDelta}`,
                color: reward.isCritical ? '#ffcc00' : '#00ffee',
                isCritical: reward.isCritical,
                remainingMs: 480,
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

  // Combo decay when no graze tick occurred on this frame and no direct hit just reset it
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
      player: {
        x: clampedPos.x,
        y: clampedPos.y,
        invulnerableMs: nextInvulnerableMs,
        trail: nextTrail,
      },
      hazards,
      sparks: fx.sparks.slice(-90),
      popups: fx.popups,
      cutIn,
      score,
      comboMultiplier,
      maxCombo,
      comboGauge,
      totalGrazeCount,
      lives,
      survivalTimeMs,
      nextWaveInMs,
      waveCounter,
      screenShakeMs,
      hitFlashMs,
      traceLog,
      grazeLog,
    },
    events: {
      grazeCount,
      criticalGrazeCount,
      directHit,
      gameOver,
      spawnedLaserCount,
      spawnedBombCount,
      bombDetonatedCount,
      laserActivatedCount,
    },
  };
}
