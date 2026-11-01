import { GAME_PARAMS, type GameParams } from './params';
import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type Hazard,
  type LaserHazard,
} from './types';

export const CONSTANT_BULLET_SPEED = GAME_PARAMS.bullet.speed;

export function getBombPhase(
  bomb: BombHazard,
  params: GameParams = GAME_PARAMS
): {
  readonly phase: 'CONVERGING' | 'HOLD' | 'ACTIVE' | 'EXPIRED';
  readonly currentRingRadius: number;
} {
  if (bomb.elapsedMs < bomb.convergeDurationMs) {
    const progress = Math.max(0, Math.min(1, bomb.elapsedMs / bomb.convergeDurationMs));
    const startScale = params.bomb.convergeStartRingScale;
    return {
      phase: 'CONVERGING',
      currentRingRadius: bomb.blastRadius * (startScale - (startScale - 1) * progress),
    };
  }
  const activeStart = bomb.convergeDurationMs + bomb.holdDurationMs;
  if (bomb.elapsedMs < activeStart) {
    return {
      phase: 'HOLD',
      currentRingRadius: bomb.blastRadius,
    };
  }
  if (bomb.elapsedMs < activeStart + bomb.activeDurationMs) {
    return {
      phase: 'ACTIVE',
      currentRingRadius: bomb.blastRadius,
    };
  }
  return {
    phase: 'EXPIRED',
    currentRingRadius: bomb.blastRadius,
  };
}

export function getLaserPhase(laser: LaserHazard): 'WARNING' | 'ACTIVE' | 'EXPIRED' {
  if (laser.elapsedMs < laser.warningDurationMs) {
    return 'WARNING';
  }
  if (laser.elapsedMs < laser.warningDurationMs + laser.activeDurationMs) {
    return 'ACTIVE';
  }
  return 'EXPIRED';
}

export function getBulletPhase(bullet: BulletHazard): 'WARNING' | 'ACTIVE' {
  return bullet.elapsedMs < 0 ? 'WARNING' : 'ACTIVE';
}

export function stepHazards(
  hazards: readonly Hazard[],
  dtMs: number,
  params: GameParams = GAME_PARAMS
): readonly Hazard[] {
  const dtSec = dtMs / 1000;
  const cullMargin = params.bullet.offscreenCullMargin;
  const next: Hazard[] = [];

  for (const h of hazards) {
    if (h.kind === 'BULLET') {
      if (h.elapsedMs < 0) {
        const nextElapsed = h.elapsedMs + dtMs;
        if (nextElapsed < 0) {
          next.push({ ...h, elapsedMs: nextElapsed });
        } else {
          const activeSec = nextElapsed / 1000;
          const x = h.x + h.vx * activeSec;
          const y = h.y + h.vy * activeSec;
          if (
            x >= -cullMargin &&
            x <= LOGICAL_WIDTH + cullMargin &&
            y >= HUD_HEIGHT - cullMargin &&
            y <= LOGICAL_HEIGHT + cullMargin
          ) {
            next.push({ ...h, x, y, elapsedMs: nextElapsed });
          }
        }
      } else {
        const x = h.x + h.vx * dtSec;
        const y = h.y + h.vy * dtSec;
        const elapsedMs = h.elapsedMs + dtMs;
        if (
          x >= -cullMargin &&
          x <= LOGICAL_WIDTH + cullMargin &&
          y >= HUD_HEIGHT - cullMargin &&
          y <= LOGICAL_HEIGHT + cullMargin
        ) {
          next.push({ ...h, x, y, elapsedMs });
        }
      }
    } else if (h.kind === 'BOMB') {
      const updated: BombHazard = { ...h, elapsedMs: h.elapsedMs + dtMs };
      if (getBombPhase(updated, params).phase !== 'EXPIRED') {
        next.push(updated);
      }
    } else {
      const updated: LaserHazard = { ...h, elapsedMs: h.elapsedMs + dtMs };
      if (getLaserPhase(updated) !== 'EXPIRED') {
        next.push(updated);
      }
    }
  }

  return next;
}

export interface ThreatProfile {
  readonly level: number;
  readonly bulletSpeed: number;
  readonly bulletsPerStream: number;
  readonly streamCount: number;
  readonly bulletIntervalMs: number;
  readonly laserCount: number;
  readonly laserIntervalMs: number;
  readonly bombCount: number;
  readonly bombIntervalMs: number;
}

export function computeThreatLevel(
  elapsedSurvivalMs: number,
  params: GameParams = GAME_PARAMS,
  startLevel = params.threat.defaultStartLevel
): ThreatProfile {
  const { threat, bullet } = params;
  const safeMs = Math.max(0, elapsedSurvivalMs);
  const effectiveElapsedMs = safeMs + startLevel * threat.levelIntervalMs;
  const level = Math.floor(effectiveElapsedMs / threat.levelIntervalMs);
  const progress = Math.min(1, effectiveElapsedMs / threat.maxProgressDurationMs);

  return {
    level,
    bulletSpeed: bullet.speed,
    bulletsPerStream: Math.max(
      1,
      threat.baseBulletsPerStream +
        Math.min(
          threat.maxExtraBulletsPerStream,
          Math.floor(level * threat.bulletsPerStreamLevelFactor)
        )
    ),
    streamCount: level >= threat.dualStreamStartLevel ? 2 : 1,
    bulletIntervalMs: Math.round(
      threat.bulletIntervalStartMs -
        (threat.bulletIntervalStartMs - threat.bulletIntervalEndMs) * progress
    ),
    laserCount: Math.max(
      0,
      Math.min(
        threat.maxLaserCount,
        threat.baseLaserCount +
          Math.floor((level + threat.laserCountLevelOffset) / threat.laserCountLevelDivisor)
      )
    ),
    laserIntervalMs: Math.round(
      threat.laserIntervalStartMs -
        (threat.laserIntervalStartMs - threat.laserIntervalEndMs) * progress
    ),
    bombCount: Math.max(
      0,
      Math.min(
        threat.maxBombCount,
        threat.baseBombCount +
          Math.floor((level + threat.bombCountLevelOffset) / threat.bombCountLevelDivisor)
      )
    ),
    bombIntervalMs: Math.round(
      threat.bombIntervalStartMs -
        (threat.bombIntervalStartMs - threat.bombIntervalEndMs) * progress
    ),
  };
}

export function nextJitteredInterval(
  baseIntervalMs: number,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): number {
  const { intervalJitterMin, intervalJitterRange, minSpawnIntervalMs } = params.threat;
  const jitterFactor = intervalJitterMin + rng() * intervalJitterRange;
  return Math.max(minSpawnIntervalMs, Math.round(baseIntervalMs * jitterFactor));
}

function createLaserThroughPoint(
  id: string,
  focusX: number,
  focusY: number,
  angleRad: number,
  halfWidth = GAME_PARAMS.laser.baseHalfWidth,
  staggerMs = 0,
  params: GameParams = GAME_PARAMS
): LaserHazard {
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);
  let tMin = -800;
  let tMax = 800;

  if (Math.abs(dirX) > 1e-6) {
    const t1 = (0 - focusX) / dirX;
    const t2 = (LOGICAL_WIDTH - focusX) / dirX;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (Math.abs(dirY) > 1e-6) {
    const t1 = (HUD_HEIGHT - focusY) / dirY;
    const t2 = (LOGICAL_HEIGHT - focusY) / dirY;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (tMax <= tMin + 1) {
    tMin = -800;
    tMax = 800;
  }

  return {
    id,
    kind: 'LASER',
    x1: focusX + dirX * tMin,
    y1: focusY + dirY * tMin,
    x2: focusX + dirX * tMax,
    y2: focusY + dirY * tMax,
    halfWidth,
    elapsedMs: -staggerMs,
    warningDurationMs: params.laser.warningDurationMs,
    activeDurationMs: params.laser.activeDurationMs,
    grazeTimerMs: 0,
  };
}

export function pickEdgeInsetSpawnPoint(
  edgeRoll: number,
  posRoll: number,
  params: GameParams = GAME_PARAMS
): { readonly startX: number; readonly startY: number } {
  const {
    edgeTopWeight,
    edgeLeftThreshold,
    edgeRightThreshold,
    edgeHorizontalPadding,
    edgeVerticalPadding,
    edgeInsetMargin,
  } = params.bullet;
  const arenaTop = HUD_HEIGHT + edgeVerticalPadding;
  const arenaBottom = LOGICAL_HEIGHT - edgeVerticalPadding;
  if (edgeRoll < edgeTopWeight) {
    return {
      startX: edgeHorizontalPadding + posRoll * (LOGICAL_WIDTH - edgeHorizontalPadding * 2),
      startY: HUD_HEIGHT + edgeInsetMargin,
    };
  }
  if (edgeRoll < edgeLeftThreshold) {
    return {
      startX: edgeInsetMargin,
      startY: arenaTop + posRoll * (arenaBottom - arenaTop),
    };
  }
  if (edgeRoll < edgeRightThreshold) {
    return {
      startX: LOGICAL_WIDTH - edgeInsetMargin,
      startY: arenaTop + posRoll * (arenaBottom - arenaTop),
    };
  }
  return {
    startX: edgeHorizontalPadding + posRoll * (LOGICAL_WIDTH - edgeHorizontalPadding * 2),
    startY: LOGICAL_HEIGHT - edgeInsetMargin,
  };
}

export function pickInFieldSafeSpawnPoint(
  playerPos: { readonly x: number; readonly y: number },
  rng: () => number,
  params: GameParams = GAME_PARAMS
): { readonly startX: number; readonly startY: number } {
  const { inFieldMarginX, inFieldMarginY, inFieldMinSafeDistance } = params.bullet;
  const minX = inFieldMarginX;
  const maxX = LOGICAL_WIDTH - inFieldMarginX;
  const minY = HUD_HEIGHT + inFieldMarginY;
  const maxY = LOGICAL_HEIGHT - inFieldMarginY;

  let bestX = LOGICAL_WIDTH / 2;
  let bestY = minY;
  let bestDist = -1;

  for (let attempt = 0; attempt < 16; attempt++) {
    const cx = minX + rng() * Math.max(0, maxX - minX);
    const cy = minY + rng() * Math.max(0, maxY - minY);
    const dist = Math.hypot(cx - playerPos.x, cy - playerPos.y);
    if (dist >= inFieldMinSafeDistance) {
      return { startX: cx, startY: cy };
    }
    if (dist > bestDist) {
      bestDist = dist;
      bestX = cx;
      bestY = cy;
    }
  }

  return { startX: bestX, startY: bestY };
}

export function getUnlockedBulletPatterns(
  level: number,
  params: GameParams = GAME_PARAMS
): readonly number[] {
  const { bullet } = params;
  const unlocked: number[] = [0, 1];
  if (level >= bullet.sweepUnlockLevel) unlocked.push(2);
  if (level >= bullet.crossUnlockLevel) unlocked.push(3);
  if (level >= bullet.ringUnlockLevel) unlocked.push(4);
  if (level >= bullet.curtainUnlockLevel) unlocked.push(5);
  if (level >= bullet.vortexUnlockLevel) unlocked.push(6);
  if (level >= bullet.flowerUnlockLevel) unlocked.push(7);
  if (level >= bullet.latticeUnlockLevel) unlocked.push(8);
  if (level >= bullet.starUnlockLevel) unlocked.push(9);
  return unlocked;
}

function createSleepingBullet(
  id: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  baseWarningMs: number,
  staggerMs: number
): BulletHazard {
  const totalWarningMs = Math.max(1, Math.round(baseWarningMs + Math.max(0, staggerMs)));
  return {
    id,
    kind: 'BULLET',
    x,
    y,
    vx,
    vy,
    radius,
    elapsedMs: -totalWarningMs,
    warningDurationMs: totalWarningMs,
    grazeTimerMs: 0,
    grazeCount: 0,
  };
}

export function spawnBulletPatternById(
  patternType: number,
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly BulletHazard[] {
  const { bullet } = params;
  const bullets: BulletHazard[] = [];
  const baseWarningMs = bullet.warningDurationMs;
  const speed = threat.bulletSpeed;
  const level = threat.level;

  const isEdgePattern =
    patternType === 0 ||
    patternType === 1 ||
    patternType === 2 ||
    patternType === 3 ||
    patternType === 5;
  const firstEdgeRoll = rng();
  const origin = isEdgePattern
    ? pickEdgeInsetSpawnPoint(firstEdgeRoll, rng(), params)
    : pickInFieldSafeSpawnPoint(playerPos, rng, params);

  const targetX = playerPos.x + (rng() - 0.5) * bullet.aimSpread;
  const targetY = playerPos.y + (rng() - 0.5) * bullet.aimSpread;
  const baseAngle = Math.atan2(targetY - origin.startY, targetX - origin.startX);

  if (patternType === 0) {
    // Pattern 0 (LINE): Straight single-file lance burst
    const dirX = Math.cos(baseAngle);
    const dirY = Math.sin(baseAngle);
    for (let i = 0; i < threat.bulletsPerStream; i++) {
      bullets.push(
        createSleepingBullet(
          `${idPrefix}-line-${i}`,
          origin.startX,
          origin.startY,
          dirX * speed,
          dirY * speed,
          bullet.radius,
          baseWarningMs,
          i * bullet.lineStaggerMs
        )
      );
    }
  } else if (patternType === 1) {
    // Pattern 1 (FAN): N-way fan salvos
    const ways = level >= bullet.fanHighLevelThreshold ? bullet.fanHighLevelWays : bullet.fanWays;
    const centerWay = (ways - 1) / 2;
    const rows = Math.max(bullet.fanMinRows, Math.ceil(threat.bulletsPerStream / bullet.fanWays));
    for (let r = 0; r < rows; r++) {
      const staggerMs = r * bullet.fanRowStaggerMs;
      for (let w = 0; w < ways; w++) {
        const angle = baseAngle + (w - centerWay) * bullet.fanAngleStepRad;
        bullets.push(
          createSleepingBullet(
            `${idPrefix}-fan-${r}-${w}`,
            origin.startX,
            origin.startY,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            bullet.radius,
            baseWarningMs,
            staggerMs
          )
        );
      }
    }
  } else if (patternType === 2) {
    // Pattern 2 (SWEEP / SPIRAL): Angular sweep stream
    const sweepDir = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < threat.bulletsPerStream; i++) {
      const angle =
        baseAngle + sweepDir * (i - threat.bulletsPerStream / 2) * bullet.spiralAngleStepRad;
      bullets.push(
        createSleepingBullet(
          `${idPrefix}-spiral-${i}`,
          origin.startX,
          origin.startY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          bullet.radius,
          baseWarningMs,
          i * bullet.spiralStaggerMs
        )
      );
    }
  } else if (patternType === 3) {
    // Pattern 3 (CROSS): Dual intersecting streams from two opposing wall-inset origins
    const secondOrigin = pickEdgeInsetSpawnPoint((firstEdgeRoll + 0.5) % 1, rng(), params);
    const secondAngle = Math.atan2(
      targetY - secondOrigin.startY,
      targetX - secondOrigin.startX
    );
    const halfCount = Math.max(bullet.crossMinPerSide, Math.ceil(threat.bulletsPerStream / 2));

    for (let i = 0; i < halfCount; i++) {
      const staggerMs = i * bullet.crossStaggerMs;
      bullets.push(
        createSleepingBullet(
          `${idPrefix}-crossA-${i}`,
          origin.startX,
          origin.startY,
          Math.cos(baseAngle) * speed,
          Math.sin(baseAngle) * speed,
          bullet.radius,
          baseWarningMs,
          staggerMs
        ),
        createSleepingBullet(
          `${idPrefix}-crossB-${i}`,
          secondOrigin.startX,
          secondOrigin.startY,
          Math.cos(secondAngle) * speed,
          Math.sin(secondAngle) * speed,
          bullet.radius,
          baseWarningMs,
          staggerMs
        )
      );
    }
  } else if (patternType === 4) {
    // Pattern 4 (RING): Omnidirectional radial ring (1 or 2 concentric layers)
    const count =
      bullet.ringBaseCount + Math.min(bullet.ringMaxExtraCount, Math.floor(level * 2));
    const layers = level >= bullet.ringDualLayerLevel ? 2 : 1;
    for (let layer = 0; layer < layers; layer++) {
      const offsetAngle = (layer * Math.PI) / count;
      const layerSpeed = speed * (1 - layer * bullet.ringInnerSpeedDrop);
      const staggerMs = layer * bullet.ringLayerStaggerMs;
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + offsetAngle + (i * Math.PI * 2) / count;
        bullets.push(
          createSleepingBullet(
            `${idPrefix}-ring-${layer}-${i}`,
            origin.startX,
            origin.startY,
            Math.cos(angle) * layerSpeed,
            Math.sin(angle) * layerSpeed,
            bullet.radius,
            baseWarningMs,
            staggerMs
          )
        );
      }
    }
  } else if (patternType === 5) {
    // Pattern 5 (CURTAIN): Wide waving fan curtain with alternating row twist
    const ways =
      bullet.curtainBaseWays +
      Math.min(bullet.curtainMaxExtraWays, Math.floor(level / 2));
    const rows = 2 + Math.min(2, Math.floor(level / 3));
    const centerWay = (ways - 1) / 2;
    for (let r = 0; r < rows; r++) {
      const staggerMs = r * bullet.curtainRowStaggerMs;
      const twist = (r % 2 === 0 ? 1 : -1) * bullet.curtainRowTwistRad;
      for (let w = 0; w < ways; w++) {
        const angle = baseAngle + twist + (w - centerWay) * bullet.curtainAngleStepRad;
        bullets.push(
          createSleepingBullet(
            `${idPrefix}-curtain-${r}-${w}`,
            origin.startX,
            origin.startY,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            bullet.radius,
            baseWarningMs,
            staggerMs
          )
        );
      }
    }
  } else if (patternType === 6) {
    // Pattern 6 (VORTEX): Counter-rotating bi-spiral arms from in-field safe origin
    const arms = level >= bullet.vortexHighArmLevel ? bullet.vortexHighArms : bullet.vortexBaseArms;
    const perArm = 3 + Math.min(4, Math.floor(level / 2));
    for (let r = 0; r < perArm; r++) {
      const staggerMs = r * bullet.vortexStaggerMs;
      for (let arm = 0; arm < arms; arm++) {
        const dir = arm % 2 === 0 ? 1 : -1;
        const angle = baseAngle + (arm * Math.PI * 2) / arms + dir * r * bullet.vortexTwistRad;
        bullets.push(
          createSleepingBullet(
            `${idPrefix}-vortex-${r}-${arm}`,
            origin.startX,
            origin.startY,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            bullet.radius,
            baseWarningMs,
            staggerMs
          )
        );
      }
    }
  } else if (patternType === 7) {
    // Pattern 7 (FLOWER): Rosette petal speed modulation (constant velocity per bullet)
    const petals =
      level >= bullet.flowerHighPetalLevel ? bullet.flowerHighPetals : bullet.flowerPetals;
    const pointsPerPetal =
      bullet.flowerBasePointsPerPetal +
      Math.min(bullet.flowerMaxExtraPointsPerPetal, Math.floor(level / 2));
    const count = petals * pointsPerPetal;
    for (let i = 0; i < count; i++) {
      const theta = (i * Math.PI * 2) / count;
      const angle = baseAngle + theta;
      const petalSpeed = speed * (1 + bullet.flowerSpeedMod * Math.cos(petals * theta));
      bullets.push(
        createSleepingBullet(
          `${idPrefix}-flower-${i}`,
          origin.startX,
          origin.startY,
          Math.cos(angle) * petalSpeed,
          Math.sin(angle) * petalSpeed,
          bullet.radius,
          baseWarningMs,
          0
        )
      );
    }
  } else if (patternType === 8) {
    // Pattern 8 (LATTICE): Intersecting parallel lanes forming diamond pockets
    const lanes =
      bullet.latticeBaseLanes +
      Math.min(bullet.latticeMaxExtraLanes, Math.floor(level / 3));
    const perLane = 2 + Math.min(2, Math.floor(level / 3));
    for (const side of [-1, 1] as const) {
      const angle = baseAngle + side * bullet.latticeAngleRad;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      for (let l = 0; l < lanes; l++) {
        const laneOffset = (l - (lanes - 1) / 2) * bullet.latticeLaneSpacing;
        const ox = Math.max(
          bullet.edgeInsetMargin,
          Math.min(LOGICAL_WIDTH - bullet.edgeInsetMargin, origin.startX + nx * laneOffset)
        );
        const oy = Math.max(
          HUD_HEIGHT + bullet.edgeInsetMargin,
          Math.min(LOGICAL_HEIGHT - bullet.edgeInsetMargin, origin.startY + ny * laneOffset)
        );
        for (let k = 0; k < perLane; k++) {
          bullets.push(
            createSleepingBullet(
              `${idPrefix}-lattice-${side > 0 ? 'R' : 'L'}-${l}-${k}`,
              ox,
              oy,
              Math.cos(angle) * speed,
              Math.sin(angle) * speed,
              bullet.radius,
              baseWarningMs,
              k * bullet.latticeStaggerMs
            )
          );
        }
      }
    }
  } else {
    // Pattern 9 (STAR): Polygon / Star chord linear velocity interpolation
    const vertices = Math.max(3, Math.floor(bullet.starVertices));
    const chordStep = Math.max(1, Math.floor(bullet.starChordStep));
    const perEdge =
      bullet.starBasePerEdge +
      Math.min(bullet.starMaxExtraPerEdge, Math.floor(level / 2));
    const vertexSpeed = speed * bullet.starSpeedScale;

    for (let v = 0; v < vertices; v++) {
      const a1 = baseAngle + (v * Math.PI * 2) / vertices;
      const a2 = baseAngle + (((v + chordStep) % vertices) * Math.PI * 2) / vertices;
      const vx1 = Math.cos(a1) * vertexSpeed;
      const vy1 = Math.sin(a1) * vertexSpeed;
      const vx2 = Math.cos(a2) * vertexSpeed;
      const vy2 = Math.sin(a2) * vertexSpeed;
      for (let k = 0; k < perEdge; k++) {
        const t = k / perEdge;
        bullets.push(
          createSleepingBullet(
            `${idPrefix}-star-${v}-${k}`,
            origin.startX,
            origin.startY,
            vx1 * (1 - t) + vx2 * t,
            vy1 * (1 - t) + vy2 * t,
            bullet.radius,
            baseWarningMs,
            0
          )
        );
      }
    }
  }

  return bullets;
}

export function spawnBulletStream(
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly BulletHazard[] {
  const unlocked = getUnlockedBulletPatterns(threat.level, params);
  const bullets: BulletHazard[] = [];

  for (let s = 0; s < threat.streamCount; s++) {
    const pickIdx = Math.min(unlocked.length - 1, Math.floor(rng() * unlocked.length));
    const patternType = unlocked[pickIdx];
    bullets.push(
      ...spawnBulletPatternById(
        patternType,
        threat,
        playerPos,
        `${idPrefix}-${s}`,
        rng,
        params
      )
    );
  }

  return bullets;
}

export function spawnLaserFormation(
  threat: ThreatProfile,
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly LaserHazard[] {
  if (threat.laserCount <= 0) {
    return [];
  }
  const { laser } = params;
  const canCage = threat.laserCount >= laser.cageMinLasers;
  const patternCount = canCage ? 3 : 2;
  const patternType = Math.min(patternCount - 1, Math.floor(rng() * patternCount)); // 0: PINPOINT, 1: PARALLEL, 2: CAGE (3+ lasers only)
  const arenaTop = HUD_HEIGHT + laser.focusMarginY;
  const arenaBottom = LOGICAL_HEIGHT - laser.focusMarginY;
  const focusX = laser.focusMarginX + rng() * (LOGICAL_WIDTH - laser.focusMarginX * 2);
  const focusY = arenaTop + rng() * (arenaBottom - arenaTop);
  const baseAngle = rng() * Math.PI * 2;
  const lasers: LaserHazard[] = [];

  if (patternType === 0) {
    // Pattern 0 (PINPOINT): All lasers intersect at (focusX, focusY) with line slopes spaced by PI / count
    // so every pair of intersecting lines has an acute angle >= pinpointMinAcuteDeg, while firing direction flips across 0..2PI.
    const stepRad = Math.PI / threat.laserCount;
    const minAcuteRad = (laser.pinpointMinAcuteDeg * Math.PI) / 180;
    const maxJitterRad = Math.max(
      0,
      Math.min(laser.pinpointMaxJitterRad, (stepRad - minAcuteRad) * 0.45)
    );

    for (let i = 0; i < threat.laserCount; i++) {
      const jitter = (rng() - 0.5) * 2 * maxJitterRad;
      const directionFlip = i > 0 && rng() < 0.5 ? Math.PI : 0;
      const angle = baseAngle + i * stepRad + jitter + directionFlip;
      const staggerMs = Math.round(
        i * (laser.pinpointStaggerBaseMs + rng() * laser.pinpointStaggerRangeMs)
      );
      lasers.push(
        createLaserThroughPoint(
          `${idPrefix}-l-pin-${i}`,
          focusX,
          focusY,
          angle,
          laser.baseHalfWidth + (i % 2) * laser.alternateHalfWidthBonus,
          staggerMs,
          params
        )
      );
    }
  } else if (patternType === 1) {
    // Pattern 1 (PARALLEL): Equally spaced parallel lanes with alternating opposing firing directions
    const spacing = laser.parallelSpacing;
    const normalAngle = baseAngle + Math.PI / 2;
    for (let i = 0; i < threat.laserCount; i++) {
      const offset = (i - (threat.laserCount - 1) / 2) * spacing;
      const lx = Math.max(
        laser.parallelClampMarginX,
        Math.min(
          LOGICAL_WIDTH - laser.parallelClampMarginX,
          focusX + Math.cos(normalAngle) * offset
        )
      );
      const ly = Math.max(
        arenaTop - laser.parallelClampOffsetY,
        Math.min(arenaBottom + laser.parallelClampOffsetY, focusY + Math.sin(normalAngle) * offset)
      );
      const angle = baseAngle + (i % 2 === 1 ? Math.PI : 0);
      const staggerMs = Math.round(
        i * (laser.parallelStaggerBaseMs + rng() * laser.parallelStaggerRangeMs)
      );
      lasers.push(
        createLaserThroughPoint(
          `${idPrefix}-l-par-${i}`,
          lx,
          ly,
          angle,
          laser.baseHalfWidth + (i % 2) * laser.alternateHalfWidthBonus,
          staggerMs,
          params
        )
      );
    }
  } else {
    // Pattern 2 (CAGE, 3+ lasers): Polygon ring tangent to a circle of radius cageRadius around (focusX, focusY)
    const cageRadius = laser.cageRadius;
    for (let i = 0; i < threat.laserCount; i++) {
      const theta = baseAngle + (i * Math.PI * 2) / threat.laserCount;
      const lx = focusX + Math.cos(theta) * cageRadius;
      const ly = focusY + Math.sin(theta) * cageRadius;
      const tangentAngle = theta + Math.PI / 2;
      const staggerMs = Math.round(
        i * (laser.cageStaggerBaseMs + rng() * laser.cageStaggerRangeMs)
      );
      lasers.push(
        createLaserThroughPoint(
          `${idPrefix}-l-cage-${i}`,
          lx,
          ly,
          tangentAngle,
          laser.baseHalfWidth + (i % 2) * laser.alternateHalfWidthBonus,
          staggerMs,
          params
        )
      );
    }
  }

  return lasers;
}

export function spawnBombCluster(
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly BombHazard[] {
  const { bomb } = params;
  const arenaTop = HUD_HEIGHT + bomb.marginY;
  const arenaBottom = LOGICAL_HEIGHT - bomb.marginY;
  const bombs: BombHazard[] = [];

  for (let i = 0; i < threat.bombCount; i++) {
    const bx =
      i === 0
        ? Math.max(
            bomb.marginX,
            Math.min(
              LOGICAL_WIDTH - bomb.marginX,
              playerPos.x + (rng() - 0.5) * bomb.targetJitterRange
            )
          )
        : bomb.marginX + rng() * (LOGICAL_WIDTH - bomb.marginX * 2);
    const by =
      i === 0
        ? Math.max(
            arenaTop,
            Math.min(arenaBottom, playerPos.y + (rng() - 0.5) * bomb.targetJitterRange)
          )
        : arenaTop + rng() * (arenaBottom - arenaTop);
    const blastRadius = bomb.minBlastRadius + Math.round(rng() * bomb.blastRadiusRange);
    const staggerMs = Math.round(i * (bomb.staggerBaseMs + rng() * bomb.staggerRangeMs));
    bombs.push({
      id: `${idPrefix}-bm-${i}`,
      kind: 'BOMB',
      x: bx,
      y: by,
      blastRadius,
      elapsedMs: -staggerMs,
      convergeDurationMs: bomb.convergeDurationMs,
      holdDurationMs: bomb.holdDurationMs,
      activeDurationMs: bomb.activeDurationMs,
      grazeTimerMs: 0,
    });
  }

  return bombs;
}
