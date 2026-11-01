import rawParamsToml from '../config/params.toml?raw';

export interface PlayerParams {
  readonly initialLives: number;
  readonly invulnerableMs: number;
  readonly coreRadius: number;
  readonly grazeRadius: number;
  readonly defaultCenterYRatio: number;
}

export interface ScoringParams {
  readonly grazeTickMs: number;
  readonly baseTickScore: number;
  readonly proximityScoreMultiplier: number;
  readonly comboBaseDelta: number;
  readonly comboProximityDelta: number;
  readonly criticalClosenessThreshold: number;
  readonly comboHoldMs: number;
  readonly maxComboMultiplier: number;
  readonly comboDecayMinPerSec: number;
  readonly comboDecayExcessFactor: number;
  readonly peakWindowMs: number;
}

export interface ThreatParams {
  readonly initialBulletDelayMs: number;
  readonly initialLaserDelayMs: number;
  readonly initialBombDelayMs: number;
  readonly levelIntervalMs: number;
  readonly maxProgressDurationMs: number;
  readonly baseBulletsPerStream: number;
  readonly maxExtraBulletsPerStream: number;
  readonly bulletsPerStreamLevelFactor: number;
  readonly dualStreamStartLevel: number;
  readonly bulletIntervalStartMs: number;
  readonly bulletIntervalEndMs: number;
  readonly baseLaserCount: number;
  readonly maxLaserCount: number;
  readonly laserCountLevelDivisor: number;
  readonly laserIntervalStartMs: number;
  readonly laserIntervalEndMs: number;
  readonly baseBombCount: number;
  readonly maxBombCount: number;
  readonly bombCountLevelOffset: number;
  readonly bombCountLevelDivisor: number;
  readonly bombIntervalStartMs: number;
  readonly bombIntervalEndMs: number;
  readonly intervalJitterMin: number;
  readonly intervalJitterRange: number;
  readonly minSpawnIntervalMs: number;
}

export interface BulletParams {
  readonly speed: number;
  readonly radius: number;
  readonly offscreenCullMargin: number;
  readonly aimSpread: number;
  readonly edgeTopWeight: number;
  readonly edgeLeftThreshold: number;
  readonly edgeRightThreshold: number;
  readonly edgeHorizontalPadding: number;
  readonly edgeVerticalPadding: number;
  readonly edgeOutsideOffset: number;
  readonly lineSpacing: number;
  readonly fanWays: number;
  readonly fanMinRows: number;
  readonly fanAngleStepRad: number;
  readonly fanRowSpacing: number;
  readonly spiralAngleStepRad: number;
  readonly spiralSpacing: number;
  readonly crossMinPerSide: number;
  readonly crossSpacing: number;
}

export interface LaserParams {
  readonly warningDurationMs: number;
  readonly activeDurationMs: number;
  readonly baseHalfWidth: number;
  readonly alternateHalfWidthBonus: number;
  readonly focusMarginX: number;
  readonly focusMarginY: number;
  readonly pinpointMinAcuteDeg: number;
  readonly pinpointMaxJitterRad: number;
  readonly pinpointStaggerBaseMs: number;
  readonly pinpointStaggerRangeMs: number;
  readonly parallelSpacing: number;
  readonly parallelClampMarginX: number;
  readonly parallelClampOffsetY: number;
  readonly parallelStaggerBaseMs: number;
  readonly parallelStaggerRangeMs: number;
  readonly cageMinLasers: number;
  readonly cageRadius: number;
  readonly cageStaggerBaseMs: number;
  readonly cageStaggerRangeMs: number;
}

export interface BombParams {
  readonly minBlastRadius: number;
  readonly blastRadiusRange: number;
  readonly convergeDurationMs: number;
  readonly holdDurationMs: number;
  readonly activeDurationMs: number;
  readonly convergeStartRingScale: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly targetJitterRange: number;
  readonly staggerBaseMs: number;
  readonly staggerRangeMs: number;
}

export interface EffectsParams {
  readonly hitScreenShakeMs: number;
  readonly hitFlashMs: number;
  readonly gameOverExplosionMs: number;
  readonly gameOverScreenShakeMs: number;
  readonly gameOverHitFlashMs: number;
  readonly gameOverHazardSlowFactor: number;
  readonly grazeScreenShakeMs: number;
  readonly screenShakeMaxPx: number;
  readonly screenShakeBasePx: number;
  readonly screenShakeRefDurationMs: number;
  readonly hitFlashMaxAlpha: number;
  readonly grazeSparksNormal: number;
  readonly grazeSparksCritical: number;
  readonly grazeSparkMinSpeed: number;
  readonly grazeSparkSpeedRange: number;
  readonly grazeSparkDurationMs: number;
  readonly maxSparks: number;
  readonly deathBurstSparkCount: number;
  readonly deathBurstMinSpeed: number;
  readonly deathBurstSpeedRange: number;
  readonly deathBurstSparkDurationMs: number;
  readonly secondaryBurstCutoffMs: number;
  readonly secondaryBurstIntervalMs: number;
  readonly secondaryBurstSparkCount: number;
  readonly secondaryBurstMinSpeed: number;
  readonly secondaryBurstSpeedRange: number;
  readonly secondaryBurstSpreadPx: number;
  readonly secondaryBurstSparkDurationMs: number;
  readonly maxPopups: number;
  readonly popupRiseSpeedPxPerSec: number;
  readonly popupDurationMs: number;
  readonly playerTrailLength: number;
  readonly invulnerableBlinkIntervalMs: number;
  readonly bombHoldBlinkIntervalMs: number;
  readonly laserWarningDrawDurationMs: number;
  readonly laserWarningSnapThreshold: number;
  readonly laserIgnitionSpikeDurationMs: number;
  readonly laserIgnitionFlashDurationMs: number;
  readonly laserIgnitionWidthBoost: number;
  readonly laserCollapseWindowMaxMs: number;
}

export interface GameParams {
  readonly player: PlayerParams;
  readonly scoring: ScoringParams;
  readonly threat: ThreatParams;
  readonly bullet: BulletParams;
  readonly laser: LaserParams;
  readonly bomb: BombParams;
  readonly effects: EffectsParams;
}

type SectionSchema<T> = {
  readonly [K in keyof T]: 'positive' | 'nonNegative' | 'unitInterval';
};

const SCHEMA: { readonly [S in keyof GameParams]: SectionSchema<GameParams[S]> } = {
  player: {
    initialLives: 'positive',
    invulnerableMs: 'nonNegative',
    coreRadius: 'positive',
    grazeRadius: 'positive',
    defaultCenterYRatio: 'unitInterval',
  },
  scoring: {
    grazeTickMs: 'positive',
    baseTickScore: 'nonNegative',
    proximityScoreMultiplier: 'nonNegative',
    comboBaseDelta: 'nonNegative',
    comboProximityDelta: 'nonNegative',
    criticalClosenessThreshold: 'unitInterval',
    comboHoldMs: 'positive',
    maxComboMultiplier: 'positive',
    comboDecayMinPerSec: 'positive',
    comboDecayExcessFactor: 'nonNegative',
    peakWindowMs: 'positive',
  },
  threat: {
    initialBulletDelayMs: 'nonNegative',
    initialLaserDelayMs: 'nonNegative',
    initialBombDelayMs: 'nonNegative',
    levelIntervalMs: 'positive',
    maxProgressDurationMs: 'positive',
    baseBulletsPerStream: 'positive',
    maxExtraBulletsPerStream: 'nonNegative',
    bulletsPerStreamLevelFactor: 'nonNegative',
    dualStreamStartLevel: 'nonNegative',
    bulletIntervalStartMs: 'positive',
    bulletIntervalEndMs: 'positive',
    baseLaserCount: 'positive',
    maxLaserCount: 'positive',
    laserCountLevelDivisor: 'positive',
    laserIntervalStartMs: 'positive',
    laserIntervalEndMs: 'positive',
    baseBombCount: 'positive',
    maxBombCount: 'positive',
    bombCountLevelOffset: 'nonNegative',
    bombCountLevelDivisor: 'positive',
    bombIntervalStartMs: 'positive',
    bombIntervalEndMs: 'positive',
    intervalJitterMin: 'positive',
    intervalJitterRange: 'nonNegative',
    minSpawnIntervalMs: 'positive',
  },
  bullet: {
    speed: 'positive',
    radius: 'positive',
    offscreenCullMargin: 'nonNegative',
    aimSpread: 'nonNegative',
    edgeTopWeight: 'unitInterval',
    edgeLeftThreshold: 'unitInterval',
    edgeRightThreshold: 'unitInterval',
    edgeHorizontalPadding: 'nonNegative',
    edgeVerticalPadding: 'nonNegative',
    edgeOutsideOffset: 'nonNegative',
    lineSpacing: 'positive',
    fanWays: 'positive',
    fanMinRows: 'positive',
    fanAngleStepRad: 'nonNegative',
    fanRowSpacing: 'positive',
    spiralAngleStepRad: 'nonNegative',
    spiralSpacing: 'positive',
    crossMinPerSide: 'positive',
    crossSpacing: 'positive',
  },
  laser: {
    warningDurationMs: 'positive',
    activeDurationMs: 'positive',
    baseHalfWidth: 'positive',
    alternateHalfWidthBonus: 'nonNegative',
    focusMarginX: 'nonNegative',
    focusMarginY: 'nonNegative',
    pinpointMinAcuteDeg: 'positive',
    pinpointMaxJitterRad: 'nonNegative',
    pinpointStaggerBaseMs: 'nonNegative',
    pinpointStaggerRangeMs: 'nonNegative',
    parallelSpacing: 'positive',
    parallelClampMarginX: 'nonNegative',
    parallelClampOffsetY: 'nonNegative',
    parallelStaggerBaseMs: 'nonNegative',
    parallelStaggerRangeMs: 'nonNegative',
    cageMinLasers: 'positive',
    cageRadius: 'positive',
    cageStaggerBaseMs: 'nonNegative',
    cageStaggerRangeMs: 'nonNegative',
  },
  bomb: {
    minBlastRadius: 'positive',
    blastRadiusRange: 'nonNegative',
    convergeDurationMs: 'positive',
    holdDurationMs: 'positive',
    activeDurationMs: 'positive',
    convergeStartRingScale: 'positive',
    marginX: 'nonNegative',
    marginY: 'nonNegative',
    targetJitterRange: 'nonNegative',
    staggerBaseMs: 'nonNegative',
    staggerRangeMs: 'nonNegative',
  },
  effects: {
    hitScreenShakeMs: 'nonNegative',
    hitFlashMs: 'nonNegative',
    gameOverExplosionMs: 'positive',
    gameOverScreenShakeMs: 'nonNegative',
    gameOverHitFlashMs: 'nonNegative',
    gameOverHazardSlowFactor: 'positive',
    grazeScreenShakeMs: 'nonNegative',
    screenShakeMaxPx: 'nonNegative',
    screenShakeBasePx: 'nonNegative',
    screenShakeRefDurationMs: 'positive',
    hitFlashMaxAlpha: 'unitInterval',
    grazeSparksNormal: 'nonNegative',
    grazeSparksCritical: 'nonNegative',
    grazeSparkMinSpeed: 'nonNegative',
    grazeSparkSpeedRange: 'nonNegative',
    grazeSparkDurationMs: 'positive',
    maxSparks: 'positive',
    deathBurstSparkCount: 'nonNegative',
    deathBurstMinSpeed: 'nonNegative',
    deathBurstSpeedRange: 'nonNegative',
    deathBurstSparkDurationMs: 'positive',
    secondaryBurstCutoffMs: 'nonNegative',
    secondaryBurstIntervalMs: 'positive',
    secondaryBurstSparkCount: 'nonNegative',
    secondaryBurstMinSpeed: 'nonNegative',
    secondaryBurstSpeedRange: 'nonNegative',
    secondaryBurstSpreadPx: 'nonNegative',
    secondaryBurstSparkDurationMs: 'positive',
    maxPopups: 'positive',
    popupRiseSpeedPxPerSec: 'nonNegative',
    popupDurationMs: 'positive',
    playerTrailLength: 'positive',
    invulnerableBlinkIntervalMs: 'positive',
    bombHoldBlinkIntervalMs: 'positive',
    laserWarningDrawDurationMs: 'positive',
    laserWarningSnapThreshold: 'unitInterval',
    laserIgnitionSpikeDurationMs: 'positive',
    laserIgnitionFlashDurationMs: 'positive',
    laserIgnitionWidthBoost: 'nonNegative',
    laserCollapseWindowMaxMs: 'positive',
  },
};

export function parseGameParams(rawToml: string): GameParams {
  const rawSections: Record<string, Record<string, number>> = {};
  let currentSection: string | null = null;

  const lines = rawToml.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const withoutComment = lines[lineIdx].replace(/#.*$/, '').trim();
    if (!withoutComment) continue;

    if (withoutComment.startsWith('[') && withoutComment.endsWith(']')) {
      const sectionName = withoutComment.slice(1, -1).trim();
      if (!(sectionName in SCHEMA)) {
        throw new Error(`Unknown TOML section [${sectionName}] at line ${lineIdx + 1}`);
      }
      currentSection = sectionName;
      if (!rawSections[currentSection]) {
        rawSections[currentSection] = {};
      }
      continue;
    }

    const eqIndex = withoutComment.indexOf('=');
    if (eqIndex === -1 || !currentSection) {
      throw new Error(`Invalid TOML entry "${withoutComment}" at line ${lineIdx + 1}`);
    }

    const key = withoutComment.slice(0, eqIndex).trim();
    const rawVal = withoutComment.slice(eqIndex + 1).trim();
    const sectionSchema = SCHEMA[currentSection as keyof GameParams] as Record<string, string>;

    if (!(key in sectionSchema)) {
      throw new Error(`Unknown parameter "${currentSection}.${key}" at line ${lineIdx + 1}`);
    }

    const normalizedNum = rawVal.replace(/_/g, '');
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalizedNum)) {
      throw new Error(
        `Invalid numeric value "${rawVal}" for "${currentSection}.${key}" at line ${lineIdx + 1}`
      );
    }

    const value = Number(normalizedNum);
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite numeric value for "${currentSection}.${key}"`);
    }

    rawSections[currentSection][key] = value;
  }

  const result: Record<string, Record<string, number>> = {};
  for (const [sectionName, sectionSchema] of Object.entries(SCHEMA)) {
    const parsedSection = rawSections[sectionName];
    if (!parsedSection) {
      throw new Error(`Missing required TOML section [${sectionName}]`);
    }
    const validatedSection: Record<string, number> = {};
    for (const [key, rule] of Object.entries(sectionSchema)) {
      if (!(key in parsedSection)) {
        throw new Error(`Missing required parameter "${sectionName}.${key}"`);
      }
      const val = parsedSection[key];
      if (rule === 'positive' && val <= 0) {
        throw new Error(`Parameter "${sectionName}.${key}" must be > 0 (got ${val})`);
      }
      if (rule === 'nonNegative' && val < 0) {
        throw new Error(`Parameter "${sectionName}.${key}" must be >= 0 (got ${val})`);
      }
      if (rule === 'unitInterval' && (val < 0 || val > 1)) {
        throw new Error(`Parameter "${sectionName}.${key}" must be between 0 and 1 (got ${val})`);
      }
      validatedSection[key] = val;
    }
    result[sectionName] = Object.freeze(validatedSection);
  }

  const typed = Object.freeze(result) as unknown as GameParams;
  if (typed.player.grazeRadius <= typed.player.coreRadius) {
    throw new Error(
      `Invalid player radii: player.grazeRadius (${typed.player.grazeRadius}) must be greater than player.coreRadius (${typed.player.coreRadius})`
    );
  }

  return typed;
}

export const GAME_PARAMS: GameParams = parseGameParams(rawParamsToml);
