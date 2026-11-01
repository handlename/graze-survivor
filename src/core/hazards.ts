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
      const x = h.x + h.vx * dtSec;
      const y = h.y + h.vy * dtSec;
      if (
        x >= -cullMargin &&
        x <= LOGICAL_WIDTH + cullMargin &&
        y >= HUD_HEIGHT - cullMargin &&
        y <= LOGICAL_HEIGHT + cullMargin
      ) {
        next.push({ ...h, x, y });
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
  params: GameParams = GAME_PARAMS
): ThreatProfile {
  const { threat, bullet } = params;
  const safeMs = Math.max(0, elapsedSurvivalMs);
  const level = Math.floor(safeMs / threat.levelIntervalMs);
  const progress = Math.min(1, safeMs / threat.maxProgressDurationMs);

  return {
    level,
    bulletSpeed: bullet.speed,
    bulletsPerStream:
      threat.baseBulletsPerStream +
      Math.min(
        threat.maxExtraBulletsPerStream,
        Math.floor(level * threat.bulletsPerStreamLevelFactor)
      ),
    streamCount: level >= threat.dualStreamStartLevel ? 2 : 1,
    bulletIntervalMs: Math.round(
      threat.bulletIntervalStartMs -
        (threat.bulletIntervalStartMs - threat.bulletIntervalEndMs) * progress
    ),
    laserCount: Math.min(
      threat.maxLaserCount,
      threat.baseLaserCount + Math.floor(level / threat.laserCountLevelDivisor)
    ),
    laserIntervalMs: Math.round(
      threat.laserIntervalStartMs -
        (threat.laserIntervalStartMs - threat.laserIntervalEndMs) * progress
    ),
    bombCount: Math.min(
      threat.maxBombCount,
      threat.baseBombCount +
        Math.floor((level + threat.bombCountLevelOffset) / threat.bombCountLevelDivisor)
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

function pickEdgeSpawnPoint(
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
    edgeOutsideOffset,
  } = params.bullet;
  const arenaTop = HUD_HEIGHT + edgeVerticalPadding;
  const arenaBottom = LOGICAL_HEIGHT - edgeVerticalPadding;
  if (edgeRoll < edgeTopWeight) {
    return {
      startX: edgeHorizontalPadding + posRoll * (LOGICAL_WIDTH - edgeHorizontalPadding * 2),
      startY: HUD_HEIGHT - edgeOutsideOffset,
    };
  }
  if (edgeRoll < edgeLeftThreshold) {
    return {
      startX: -edgeOutsideOffset,
      startY: arenaTop + posRoll * (arenaBottom - arenaTop),
    };
  }
  if (edgeRoll < edgeRightThreshold) {
    return {
      startX: LOGICAL_WIDTH + edgeOutsideOffset,
      startY: arenaTop + posRoll * (arenaBottom - arenaTop),
    };
  }
  return {
    startX: edgeHorizontalPadding + posRoll * (LOGICAL_WIDTH - edgeHorizontalPadding * 2),
    startY: LOGICAL_HEIGHT + edgeOutsideOffset,
  };
}

export function spawnBulletStream(
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly BulletHazard[] {
  const { bullet } = params;
  const bullets: BulletHazard[] = [];

  for (let s = 0; s < threat.streamCount; s++) {
    const patternType = Math.min(3, Math.floor(rng() * 4)); // 0: LINE, 1: FAN, 2: SPIRAL, 3: CROSS
    const { startX, startY } = pickEdgeSpawnPoint(rng(), rng(), params);
    const targetX = playerPos.x + (rng() - 0.5) * bullet.aimSpread;
    const targetY = playerPos.y + (rng() - 0.5) * bullet.aimSpread;
    const baseAngle = Math.atan2(targetY - startY, targetX - startX);

    if (patternType === 0) {
      // Pattern 0 (LINE): Tight straight single-file column
      const dirX = Math.cos(baseAngle);
      const dirY = Math.sin(baseAngle);
      for (let i = 0; i < threat.bulletsPerStream; i++) {
        bullets.push({
          id: `${idPrefix}-line-${s}-${i}`,
          kind: 'BULLET',
          x: startX - dirX * i * bullet.lineSpacing,
          y: startY - dirY * i * bullet.lineSpacing,
          vx: dirX * threat.bulletSpeed,
          vy: dirY * threat.bulletSpeed,
          radius: bullet.radius,
          grazeTimerMs: 0,
        });
      }
    } else if (patternType === 1) {
      // Pattern 1 (FAN): 3-way fan salvos spaced along the radial direction
      const ways = bullet.fanWays;
      const centerWay = (ways - 1) / 2;
      const rows = Math.max(bullet.fanMinRows, Math.ceil(threat.bulletsPerStream / ways));
      for (let r = 0; r < rows; r++) {
        for (let w = 0; w < ways; w++) {
          const angle = baseAngle + (w - centerWay) * bullet.fanAngleStepRad;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          bullets.push({
            id: `${idPrefix}-fan-${s}-${r}-${w}`,
            kind: 'BULLET',
            x: startX - dirX * r * bullet.fanRowSpacing,
            y: startY - dirY * r * bullet.fanRowSpacing,
            vx: dirX * threat.bulletSpeed,
            vy: dirY * threat.bulletSpeed,
            radius: bullet.radius,
            grazeTimerMs: 0,
          });
        }
      }
    } else if (patternType === 2) {
      // Pattern 2 (SPIRAL / WAVE): Sweeping curve where each sequential bullet curves its firing angle
      const sweepDir = rng() < 0.5 ? 1 : -1;
      for (let i = 0; i < threat.bulletsPerStream; i++) {
        const angle =
          baseAngle + sweepDir * (i - threat.bulletsPerStream / 2) * bullet.spiralAngleStepRad;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        bullets.push({
          id: `${idPrefix}-spiral-${s}-${i}`,
          kind: 'BULLET',
          x: startX - dirX * i * bullet.spiralSpacing,
          y: startY - dirY * i * bullet.spiralSpacing,
          vx: dirX * threat.bulletSpeed,
          vy: dirY * threat.bulletSpeed,
          radius: bullet.radius,
          grazeTimerMs: 0,
        });
      }
    } else {
      // Pattern 3 (CROSS): Dual intersecting streams from two opposing edges toward the player corridor
      const secondOrigin = pickEdgeSpawnPoint((rng() + 0.5) % 1, rng(), params);
      const secondAngle = Math.atan2(
        targetY - secondOrigin.startY,
        targetX - secondOrigin.startX
      );
      const halfCount = Math.max(bullet.crossMinPerSide, Math.ceil(threat.bulletsPerStream / 2));

      for (let i = 0; i < halfCount; i++) {
        const dx1 = Math.cos(baseAngle);
        const dy1 = Math.sin(baseAngle);
        bullets.push({
          id: `${idPrefix}-crossA-${s}-${i}`,
          kind: 'BULLET',
          x: startX - dx1 * i * bullet.crossSpacing,
          y: startY - dy1 * i * bullet.crossSpacing,
          vx: dx1 * threat.bulletSpeed,
          vy: dy1 * threat.bulletSpeed,
          radius: bullet.radius,
          grazeTimerMs: 0,
        });

        const dx2 = Math.cos(secondAngle);
        const dy2 = Math.sin(secondAngle);
        bullets.push({
          id: `${idPrefix}-crossB-${s}-${i}`,
          kind: 'BULLET',
          x: secondOrigin.startX - dx2 * i * bullet.crossSpacing,
          y: secondOrigin.startY - dy2 * i * bullet.crossSpacing,
          vx: dx2 * threat.bulletSpeed,
          vy: dy2 * threat.bulletSpeed,
          radius: bullet.radius,
          grazeTimerMs: 0,
        });
      }
    }
  }

  return bullets;
}

export function spawnLaserFormation(
  threat: ThreatProfile,
  idPrefix: string,
  rng: () => number,
  params: GameParams = GAME_PARAMS
): readonly LaserHazard[] {
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
