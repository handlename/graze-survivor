import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type Hazard,
  type LaserHazard,
} from './types';

export const CONSTANT_BULLET_SPEED = 92;

export function getBombPhase(bomb: BombHazard): {
  readonly phase: 'CONVERGING' | 'HOLD' | 'ACTIVE' | 'EXPIRED';
  readonly currentRingRadius: number;
} {
  if (bomb.elapsedMs < bomb.convergeDurationMs) {
    const progress = Math.max(0, Math.min(1, bomb.elapsedMs / bomb.convergeDurationMs));
    return {
      phase: 'CONVERGING',
      currentRingRadius: bomb.blastRadius * (2.8 - 1.8 * progress),
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

export function stepHazards(hazards: readonly Hazard[], dtMs: number): readonly Hazard[] {
  const dtSec = dtMs / 1000;
  const next: Hazard[] = [];

  for (const h of hazards) {
    if (h.kind === 'BULLET') {
      const x = h.x + h.vx * dtSec;
      const y = h.y + h.vy * dtSec;
      if (
        x >= -140 &&
        x <= LOGICAL_WIDTH + 140 &&
        y >= HUD_HEIGHT - 140 &&
        y <= LOGICAL_HEIGHT + 140
      ) {
        next.push({ ...h, x, y });
      }
    } else if (h.kind === 'BOMB') {
      const updated: BombHazard = { ...h, elapsedMs: h.elapsedMs + dtMs };
      if (getBombPhase(updated).phase !== 'EXPIRED') {
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

export function computeThreatLevel(elapsedSurvivalMs: number): ThreatProfile {
  const safeMs = Math.max(0, elapsedSurvivalMs);
  const level = Math.floor(safeMs / 15_000);
  const progress = Math.min(1, safeMs / 120_000);

  return {
    level,
    // Bullet speed is kept slow and strictly constant; difficulty scales bullet quantity & spawn frequency
    bulletSpeed: CONSTANT_BULLET_SPEED,
    bulletsPerStream: 5 + Math.min(10, Math.floor(level * 1.4)),
    streamCount: level >= 3 ? 2 : 1,
    bulletIntervalMs: Math.round(920 - (920 - 420) * progress),
    laserCount: Math.min(5, 2 + Math.floor(level / 2)),
    laserIntervalMs: Math.round(2100 - (2100 - 920) * progress),
    bombCount: Math.min(5, 2 + Math.floor((level + 1) / 2)),
    bombIntervalMs: Math.round(1850 - (1850 - 780) * progress),
  };
}

function createLaserThroughPoint(
  id: string,
  focusX: number,
  focusY: number,
  angleRad: number,
  halfWidth = 6
): LaserHazard {
  const span = 800;
  const dx = Math.cos(angleRad) * span;
  const dy = Math.sin(angleRad) * span;
  return {
    id,
    kind: 'LASER',
    x1: focusX - dx,
    y1: focusY - dy,
    x2: focusX + dx,
    y2: focusY + dy,
    halfWidth,
    elapsedMs: 0,
    warningDurationMs: 750,
    activeDurationMs: 650,
    grazeTimerMs: 0,
  };
}

export function spawnBulletStream(
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number
): readonly BulletHazard[] {
  const arenaTop = HUD_HEIGHT + 30;
  const arenaBottom = LOGICAL_HEIGHT - 30;
  const bullets: BulletHazard[] = [];

  for (let s = 0; s < threat.streamCount; s++) {
    const edgeChoice = rng();
    let startX = 0;
    let startY = 0;
    if (edgeChoice < 0.45) {
      startX = 16 + rng() * (LOGICAL_WIDTH - 32);
      startY = HUD_HEIGHT - 8;
    } else if (edgeChoice < 0.72) {
      startX = -8;
      startY = arenaTop + rng() * (arenaBottom - arenaTop);
    } else if (edgeChoice < 0.92) {
      startX = LOGICAL_WIDTH + 8;
      startY = arenaTop + rng() * (arenaBottom - arenaTop);
    } else {
      startX = 16 + rng() * (LOGICAL_WIDTH - 32);
      startY = LOGICAL_HEIGHT + 8;
    }

    const targetX = playerPos.x + (rng() - 0.5) * 90;
    const targetY = playerPos.y + (rng() - 0.5) * 90;
    const baseAngle = Math.atan2(targetY - startY, targetX - startX);
    const dirX = Math.cos(baseAngle);
    const dirY = Math.sin(baseAngle);

    // Every bullet in the stream moves at the exact same slow constant speed, spaced tightly along the chord
    for (let i = 0; i < threat.bulletsPerStream; i++) {
      const spread = (i - (threat.bulletsPerStream - 1) / 2) * 0.032;
      const vx = Math.cos(baseAngle + spread) * threat.bulletSpeed;
      const vy = Math.sin(baseAngle + spread) * threat.bulletSpeed;
      bullets.push({
        id: `${idPrefix}-b-${s}-${i}`,
        kind: 'BULLET',
        x: startX - dirX * i * 13,
        y: startY - dirY * i * 13,
        vx,
        vy,
        radius: 4.0,
        grazeTimerMs: 0,
      });
    }
  }

  return bullets;
}

export function spawnLaserFormation(
  threat: ThreatProfile,
  idPrefix: string,
  rng: () => number
): readonly LaserHazard[] {
  const arenaTop = HUD_HEIGHT + 64;
  const arenaBottom = LOGICAL_HEIGHT - 64;
  const focusX = 56 + rng() * (LOGICAL_WIDTH - 112);
  const focusY = arenaTop + rng() * (arenaBottom - arenaTop);
  const baseAngle = rng() * Math.PI;
  const lasers: LaserHazard[] = [];

  for (let i = 0; i < threat.laserCount; i++) {
    const angle = baseAngle + (i * Math.PI) / threat.laserCount + (rng() - 0.5) * 0.22;
    const offset = (i - (threat.laserCount - 1) / 2) * 14;
    const lx = Math.max(
      40,
      Math.min(LOGICAL_WIDTH - 40, focusX + Math.cos(angle + Math.PI / 2) * offset)
    );
    const ly = Math.max(
      arenaTop,
      Math.min(arenaBottom, focusY + Math.sin(angle + Math.PI / 2) * offset)
    );
    lasers.push(createLaserThroughPoint(`${idPrefix}-l-${i}`, lx, ly, angle, 5.5 + (i % 2)));
  }

  return lasers;
}

export function spawnBombCluster(
  threat: ThreatProfile,
  playerPos: { readonly x: number; readonly y: number },
  idPrefix: string,
  rng: () => number
): readonly BombHazard[] {
  const arenaTop = HUD_HEIGHT + 54;
  const arenaBottom = LOGICAL_HEIGHT - 54;
  const bombs: BombHazard[] = [];

  for (let i = 0; i < threat.bombCount; i++) {
    const bx =
      i === 0
        ? Math.max(44, Math.min(LOGICAL_WIDTH - 44, playerPos.x + (rng() - 0.5) * 56))
        : 44 + rng() * (LOGICAL_WIDTH - 88);
    const by =
      i === 0
        ? Math.max(arenaTop, Math.min(arenaBottom, playerPos.y + (rng() - 0.5) * 56))
        : arenaTop + rng() * (arenaBottom - arenaTop);
    const blastRadius = 30 + Math.round(rng() * 22);
    bombs.push({
      id: `${idPrefix}-bm-${i}`,
      kind: 'BOMB',
      x: bx,
      y: by,
      blastRadius,
      elapsedMs: -i * 90,
      convergeDurationMs: 350,
      holdDurationMs: 550,
      activeDurationMs: 450,
      grazeTimerMs: 0,
    });
  }

  return bombs;
}
