import {
  CORE_RADIUS,
  HUD_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type ControlOptions,
} from './types';

export interface MotionSample {
  readonly alphaRate: number | null;
  readonly betaRate: number | null;
  readonly gammaRate: number | null;
  readonly gx: number | null;
  readonly gy: number | null;
  readonly gz: number | null;
  readonly dtSec: number;
}

const V_REF = 0.35;
const MAX_GYRO_DT_SEC = 0.05;

export function computeSwipeDelta(
  rawDx: number,
  rawDy: number,
  dtMs: number,
  options: Pick<ControlOptions, 'swipeSpeed' | 'swipeAccel'>
): { readonly dx: number; readonly dy: number } {
  if (dtMs <= 0 || (rawDx === 0 && rawDy === 0)) {
    return { dx: 0, dy: 0 };
  }
  const effectiveDtMs = Math.max(4, Math.min(50, dtMs));
  const velocity = Math.hypot(rawDx, rawDy) / effectiveDtMs;
  const accelBoost =
    options.swipeAccel > 0 ? options.swipeAccel * Math.pow(velocity / V_REF, 0.85) : 0;
  const gain = options.swipeSpeed * (1 + accelBoost);

  return {
    dx: rawDx * gain,
    dy: rawDy * gain,
  };
}

export function computeGyroDelta(
  sample: MotionSample,
  options: Pick<ControlOptions, 'gyroSensitivity' | 'invertX' | 'invertY'>
): { readonly dx: number; readonly dy: number } {
  const dt = Math.min(MAX_GYRO_DT_SEC, Math.max(0, sample.dtSec));
  if (dt === 0) {
    return { dx: 0, dy: 0 };
  }

  const alphaRate = sample.alphaRate ?? 0;
  const betaRate = sample.betaRate ?? 0;
  const gammaRate = sample.gammaRate ?? 0;

  const gx = sample.gx ?? 0;
  const gy = sample.gy ?? 0;
  const gz = sample.gz ?? 0;
  const gMag3D = Math.hypot(gx, gy, gz);
  const gxyMag = Math.hypot(gx, gy);

  // Project 3D rotationRate onto the 3D gravity vector so holding posture or iOS portrait lock never swaps axes
  const rawHorizDegPerSec =
    gMag3D > 0.1
      ? (gx * alphaRate + gy * betaRate + gz * gammaRate) / gMag3D
      : -betaRate - gammaRate;

  const rawVertDegPerSec =
    gxyMag > 0.1 ? (gy * alphaRate - gx * betaRate) / gxyMag : -alphaRate;

  const cosPitch = gMag3D > 0.1 ? gxyMag / gMag3D : 1;
  const pitchRayGain = 1 / Math.max(0.55, cosPitch * cosPitch);

  const worldHorizRate = rawHorizDegPerSec * Math.sqrt(pitchRayGain);
  const worldVertRate = rawVertDegPerSec * pitchRayGain;

  return {
    dx: worldHorizRate * dt * options.gyroSensitivity * (options.invertX ? -1 : 1),
    dy: worldVertRate * dt * options.gyroSensitivity * (options.invertY ? -1 : 1),
  };
}

export function clampPlayerPosition(
  x: number,
  y: number
): { readonly x: number; readonly y: number } {
  const minX = CORE_RADIUS;
  const maxX = LOGICAL_WIDTH - CORE_RADIUS;
  const minY = HUD_HEIGHT + CORE_RADIUS;
  const maxY = LOGICAL_HEIGHT - CORE_RADIUS;

  return {
    x: Math.max(minX, Math.min(maxX, Number.isFinite(x) ? x : LOGICAL_WIDTH / 2)),
    y: Math.max(minY, Math.min(maxY, Number.isFinite(y) ? y : (HUD_HEIGHT + LOGICAL_HEIGHT) / 2)),
  };
}
