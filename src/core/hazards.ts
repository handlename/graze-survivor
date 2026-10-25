import {
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type BombHazard,
  type BulletHazard,
  type Hazard,
  type LaserHazard,
} from './types';

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
        x >= -60 &&
        x <= LOGICAL_WIDTH + 60 &&
        y >= HUD_HEIGHT - 60 &&
        y <= LOGICAL_HEIGHT + 60
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

export function computeThreatLevel(elapsedSurvivalMs: number): {
  readonly level: number;
  readonly spawnIntervalMs: number;
  readonly laserCount: number;
  readonly bombCount: number;
  readonly speedScale: number;
} {
  const safeMs = Math.max(0, elapsedSurvivalMs);
  const level = Math.floor(safeMs / 15_000);
  const progress = Math.min(1, safeMs / 120_000);
  const spawnIntervalMs = Math.round(2600 - (2600 - 950) * progress);
  const laserCount = Math.min(5, 2 + Math.floor(level / 2));
  const bombCount = Math.min(5, 2 + Math.floor((level + 1) / 2));
  const speedScale = 1 + 0.65 * progress;

  return {
    level,
    spawnIntervalMs,
    laserCount,
    bombCount,
    speedScale,
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

function createBulletBurst(
  idPrefix: string,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  count: number,
  baseSpeed: number
): BulletHazard[] {
  const baseAngle = Math.atan2(targetY - startY, targetX - startX);
  const bullets: BulletHazard[] = [];
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.055;
    const speed = baseSpeed + i * 16;
    const vx = Math.cos(baseAngle + spread) * speed;
    const vy = Math.sin(baseAngle + spread) * speed;
    bullets.push({
      id: `${idPrefix}-b-${i}`,
      kind: 'BULLET',
      x: startX - Math.cos(baseAngle) * i * 14,
      y: startY - Math.sin(baseAngle) * i * 14,
      vx,
      vy,
      radius: 4.0,
      grazeTimerMs: 0,
    });
  }
  return bullets;
}

export function spawnTacticalPattern(
  threatLevel: ReturnType<typeof computeThreatLevel>,
  playerPos: { readonly x: number; readonly y: number },
  nextIdPrefix: string,
  rng: () => number
): {
  readonly hazards: readonly Hazard[];
  readonly cutInText: string;
} {
  const hazards: Hazard[] = [];
  const patternIndex = Math.floor(rng() * 3);

  // Pick a focal sweet-spot inside the arena away from the immediate player position
  const arenaTop = HUD_HEIGHT + 64;
  const arenaBottom = LOGICAL_HEIGHT - 64;
  const focusX = 56 + rng() * (LOGICAL_WIDTH - 112);
  const focusY = arenaTop + rng() * (arenaBottom - arenaTop);

  // 1. Intersecting Lasers (form high-return sweet spot near focusX, focusY)
  const baseAngle = rng() * Math.PI;
  for (let i = 0; i < threatLevel.laserCount; i++) {
    const angle = baseAngle + (i * Math.PI) / threatLevel.laserCount + (rng() - 0.5) * 0.22;
    const offset = (i - (threatLevel.laserCount - 1) / 2) * 14;
    const lx = Math.max(40, Math.min(LOGICAL_WIDTH - 40, focusX + Math.cos(angle + Math.PI / 2) * offset));
    const ly = Math.max(arenaTop, Math.min(arenaBottom, focusY + Math.sin(angle + Math.PI / 2) * offset));
    hazards.push(
      createLaserThroughPoint(`${nextIdPrefix}-laser-${i}`, lx, ly, angle, 5.5 + (i % 2))
    );
  }

  // 2. Bombing Lock-Ons (deny corner camping & contest route)
  const bombCount = patternIndex === 1 ? threatLevel.bombCount + 1 : threatLevel.bombCount;
  for (let i = 0; i < bombCount; i++) {
    // First bomb biases toward player's current position to force movement; others scatter
    const bx =
      i === 0
        ? Math.max(44, Math.min(LOGICAL_WIDTH - 44, playerPos.x + (rng() - 0.5) * 48))
        : 44 + rng() * (LOGICAL_WIDTH - 88);
    const by =
      i === 0
        ? Math.max(arenaTop, Math.min(arenaBottom, playerPos.y + (rng() - 0.5) * 48))
        : arenaTop + rng() * (arenaBottom - arenaTop);
    const blastRadius = 30 + Math.round(rng() * 22);
    hazards.push({
      id: `${nextIdPrefix}-bomb-${i}`,
      kind: 'BOMB',
      x: bx,
      y: by,
      blastRadius,
      elapsedMs: -i * 90,
      convergeDurationMs: 350 + i * 90,
      holdDurationMs: 550,
      activeDurationMs: 450,
      grazeTimerMs: 0,
    });
  }

  // 3. Machine-Gun Bullet Streams (contest travel corridor and bridge combo gauge)
  const streamCount = patternIndex === 2 ? 2 : 1;
  for (let s = 0; s < streamCount; s++) {
    const fromTop = rng() < 0.55;
    const startX = fromTop ? rng() * LOGICAL_WIDTH : rng() < 0.5 ? -10 : LOGICAL_WIDTH + 10;
    const startY = fromTop ? HUD_HEIGHT - 10 : arenaTop + rng() * (arenaBottom - arenaTop);
    const targetX = (playerPos.x + focusX) * 0.5 + (rng() - 0.5) * 40;
    const targetY = (playerPos.y + focusY) * 0.5 + (rng() - 0.5) * 40;
    const burst = createBulletBurst(
      `${nextIdPrefix}-stream-${s}`,
      startX,
      startY,
      targetX,
      targetY,
      6 + Math.min(6, threatLevel.level),
      185 * threatLevel.speedScale
    );
    hazards.push(...burst);
  }

  const cutInText =
    patternIndex === 0
      ? '高エネルギー反応'
      : patternIndex === 1
        ? '爆撃圏ロックオン'
        : '多重弾幕接近';

  return {
    hazards,
    cutInText,
  };
}
