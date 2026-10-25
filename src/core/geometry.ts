import {
  BASE_TICK_SCORE,
  CORE_RADIUS,
  GRAZE_RADIUS,
  type ContactResult,
  type Hazard,
} from './types';

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

function classifyEdgeDistance(distanceToEdge: number): ContactResult {
  if (distanceToEdge <= CORE_RADIUS) {
    return { kind: 'HIT' };
  }
  if (distanceToEdge <= GRAZE_RADIUS) {
    const rawCloseness = 1 - (distanceToEdge - CORE_RADIUS) / (GRAZE_RADIUS - CORE_RADIUS);
    const closeness = Math.max(0, Math.min(1, rawCloseness));
    return {
      kind: 'GRAZE',
      distanceToEdge,
      closeness,
    };
  }
  return { kind: 'NONE' };
}

export function evaluateHazardContact(px: number, py: number, hazard: Hazard): ContactResult {
  switch (hazard.kind) {
    case 'BULLET': {
      const dist = distanceToPoint(px, py, hazard.x, hazard.y) - hazard.radius;
      return classifyEdgeDistance(dist);
    }
    case 'BOMB': {
      const activeStart = hazard.convergeDurationMs + hazard.holdDurationMs;
      const activeEnd = activeStart + hazard.activeDurationMs;
      if (hazard.elapsedMs < activeStart || hazard.elapsedMs >= activeEnd) {
        return { kind: 'NONE' };
      }
      const dist = distanceToPoint(px, py, hazard.x, hazard.y) - hazard.blastRadius;
      return classifyEdgeDistance(dist);
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
      return classifyEdgeDistance(dist);
    }
  }
}

export function computeGrazeTickReward(
  closeness: number,
  comboMultiplier: number
): {
  readonly scoreDelta: number;
  readonly comboDelta: number;
  readonly isCritical: boolean;
} {
  const clamped = Math.max(0, Math.min(1, closeness));
  const proximityFactor = 1 + 3 * clamped * clamped;
  const scoreDelta = Math.round(BASE_TICK_SCORE * proximityFactor * comboMultiplier);
  const comboDelta = 0.1 + 0.25 * clamped * clamped;
  const isCritical = clamped >= 0.7;
  return {
    scoreDelta,
    comboDelta,
    isCritical,
  };
}
