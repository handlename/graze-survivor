import { GAME_PARAMS, type GameParams } from './params';
import { type ContactResult, type Hazard } from './types';

export function distanceToPoint(px: number, py: number, x: number, y: number): number {
  return Math.hypot(px - x, py - y);
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function classifyEdgeDistance(
  distanceToEdge: number,
  params: GameParams = GAME_PARAMS
): ContactResult {
  const { coreRadius, grazeRadius } = params.player;
  if (distanceToEdge <= coreRadius) {
    return { kind: 'HIT' };
  }
  if (distanceToEdge <= grazeRadius) {
    const rawCloseness = 1 - (distanceToEdge - coreRadius) / (grazeRadius - coreRadius);
    const closeness = Math.max(0, Math.min(1, rawCloseness));
    return {
      kind: 'GRAZE',
      distanceToEdge,
      closeness,
    };
  }
  return { kind: 'NONE' };
}

export function evaluateHazardContact(
  px: number,
  py: number,
  hazard: Hazard,
  params: GameParams = GAME_PARAMS
): ContactResult {
  switch (hazard.kind) {
    case 'BULLET': {
      if (hazard.elapsedMs < 0) {
        return { kind: 'NONE' };
      }
      const dist = distanceToPoint(px, py, hazard.x, hazard.y) - hazard.radius;
      if (dist > params.player.coreRadius && hazard.grazeCount >= params.bullet.maxGrazeTicks) {
        return { kind: 'NONE' };
      }
      return classifyEdgeDistance(dist, params);
    }
    case 'BOMB': {
      const activeStart = hazard.convergeDurationMs + hazard.holdDurationMs;
      const activeEnd = activeStart + hazard.activeDurationMs;
      if (hazard.elapsedMs < activeStart || hazard.elapsedMs >= activeEnd) {
        return { kind: 'NONE' };
      }
      const dist = distanceToPoint(px, py, hazard.x, hazard.y) - hazard.blastRadius;
      return classifyEdgeDistance(dist, params);
    }
    case 'LASER': {
      if (
        hazard.elapsedMs < hazard.warningDurationMs ||
        hazard.elapsedMs >= hazard.warningDurationMs + hazard.activeDurationMs
      ) {
        return { kind: 'NONE' };
      }
      const dist =
        distanceToSegment(px, py, hazard.x1, hazard.y1, hazard.x2, hazard.y2) - hazard.halfWidth;
      return classifyEdgeDistance(dist, params);
    }
  }
}

export function computeGrazeTickReward(
  closeness: number,
  comboMultiplier: number,
  params: GameParams = GAME_PARAMS
): {
  readonly scoreDelta: number;
  readonly comboDelta: number;
  readonly isCritical: boolean;
} {
  const {
    baseTickScore,
    proximityScoreMultiplier,
    comboBaseDelta,
    comboProximityDelta,
    criticalClosenessThreshold,
  } = params.scoring;
  const clamped = Math.max(0, Math.min(1, closeness));
  const proximityFactor = 1 + proximityScoreMultiplier * clamped * clamped;
  const scoreDelta = Math.round(baseTickScore * proximityFactor * comboMultiplier);
  const comboDelta = comboBaseDelta + comboProximityDelta * clamped * clamped;
  const isCritical = clamped >= criticalClosenessThreshold;
  return {
    scoreDelta,
    comboDelta,
    isCritical,
  };
}
